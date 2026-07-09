# 多阶段构建：第一阶段编译前端，第二阶段运行 Node 服务
# 镜像最终体积小，不含构建工具链

# ===== 阶段1：构建前端 =====
FROM node:20-alpine AS builder
WORKDIR /build

# 仅复制依赖描述，利用 Docker 缓存
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# 复制源码并构建
COPY . .
# VITE_APP_NAME 在构建期注入；若需运行时配置请构建后替换或使用占位符
ARG VITE_APP_NAME=排课系统
ENV VITE_APP_NAME=$VITE_APP_NAME
RUN npm run build

# ===== 阶段2：运行时 =====
FROM node:20-alpine AS runtime
WORKDIR /app

# 安装 better-sqlite3 运行所需的 native 依赖（构建工具在 alpine 上需 python/make/g++）
# 这里直接安装预编译包：better-sqlite3 会下载对应平台的 prebuilt binary
RUN apk add --no-cache python3 make g++ \
    && npm config set fund false \
    && npm config set audit false

COPY package.json package-lock.json* ./
# 仅安装生产依赖（含 better-sqlite3）
RUN npm ci --omit=dev || npm install --omit=dev

# 清理构建工具，减小镜像体积
RUN apk del python3 make g++ || true

# 复制后端代码与前端构建产物
COPY server.js ./
COPY node-functions ./node-functions
COPY --from=builder /build/dist ./dist

# 数据持久化目录
RUN mkdir -p /app/data
VOLUME /app/data

# 环境变量默认值
ENV NODE_ENV=production
ENV PORT=8788
ENV DATA_DIR=/app/data

EXPOSE 8788

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8788/api/auth/bootstrap > /dev/null 2>&1 || exit 1

# 启动命令
CMD ["node", "server.js"]
