# 多阶段构建：第一阶段编译前端 + 编译 better-sqlite3，第二阶段仅含运行必需文件
# 镜像最终体积小，不含构建工具链与前端依赖

# ===== 阶段1：构建前端 + 安装生产依赖（含 better-sqlite3 编译） =====
FROM node:20-alpine AS builder
WORKDIR /build

# 构建期需要 python/make/g++ 来编译 better-sqlite3 native 模块
RUN apk add --no-cache python3 make g++

# 仅复制依赖描述，利用 Docker 缓存
COPY package.json package-lock.json* ./
# 安装全部依赖（含 devDependencies，构建前端需要 vite/typescript 等）
RUN npm ci --no-audit --no-fund

# 复制源码并构建前端
COPY . .
RUN npm run build

# 剪枝掉 devDependencies，仅保留生产依赖（better-sqlite3 + 其运行时依赖）
RUN npm prune --omit=dev

# 清理 better-sqlite3 编译中间产物，仅保留 .node 二进制和 lib/
# 可清理：obj/ obj.target/ .deps/ deps/ src/ binding.gyp *.a *.md
RUN rm -rf node_modules/better-sqlite3/build/Release/obj \
    node_modules/better-sqlite3/build/Release/obj.target \
    node_modules/better-sqlite3/build/Release/.deps \
    node_modules/better-sqlite3/build/Release/sqlite3.a \
    node_modules/better-sqlite3/build/Release/test_extension.node \
    node_modules/better-sqlite3/deps \
    node_modules/better-sqlite3/src \
    node_modules/better-sqlite3/binding.gyp \
    node_modules/better-sqlite3/README.md \
    && find node_modules/better-sqlite3 -name "*.md" -delete \
    && find node_modules -name "*.md" -delete \
    && find node_modules -name "*.ts" -not -path "*/better-sqlite3/*" -delete 2>/dev/null || true

# ===== 阶段2：运行时（最小化） =====
FROM node:20-alpine AS runtime
WORKDIR /app

# 环境变量默认值
ENV NODE_ENV=production
ENV PORT=8788
ENV DATA_DIR=/app/data
# 默认时区 Asia/Shanghai（可通过 docker run -e TZ=xxx 覆盖）
ENV TZ=Asia/Shanghai

# 时区配置必须在 root 权限下执行（apk add 与修改 /etc/localtime 需要系统权限）
# 放在 USER node 切换之前，避免非 root 用户执行时权限不足
RUN apk add --no-cache tzdata \
    && cp /usr/share/zoneinfo/$TZ /etc/localtime \
    && echo "$TZ" > /etc/timezone

# 复制 package.json（运行时不需要 package-lock.json）
COPY package.json ./

# 从 builder 复制已剪枝 + 已清理的生产 node_modules
COPY --from=builder /build/node_modules ./node_modules

# 复制后端代码与前端构建产物
COPY server.js ./
COPY node-functions ./node-functions
COPY --from=builder /build/dist ./dist

# 数据持久化目录
RUN mkdir -p /app/data \
    && chown -R node:node /app
VOLUME /app/data

# 安全：以非 root 用户运行应用，降低容器逃逸/RCE 的影响面
USER node

EXPOSE 8788

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8788/api/auth/bootstrap > /dev/null 2>&1 || exit 1

# 启动命令
CMD ["node", "server.js"]
