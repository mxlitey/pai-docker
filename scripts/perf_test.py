#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
排课系统性能测试脚本（双入口）

用法：
  python3 scripts/perf_test.py                              # 交互式选择
  python3 scripts/perf_test.py quick                        # 简易评估（D1-D16，约 4 分钟）
  python3 scripts/perf_test.py stress                       # 压力测试（S1-S6 + 评估报告，约 20 分钟）

  # 指定测试目标环境（默认本机）
  python3 scripts/perf_test.py quick --local                # 本机 127.0.0.1:8788
  python3 scripts/perf_test.py quick --lan 192.168.1.100    # 局域网（默认端口 8788）
  python3 scripts/perf_test.py quick --wan https://api.example.com  # 公网（完整 URL）
  python3 scripts/perf_test.py quick --base http://10.0.0.5:9000    # 自定义地址

  # 也可用环境变量 PERF_BASE 指定
  PERF_BASE=http://192.168.1.100:8788 python3 scripts/perf_test.py quick

================================================================
  📖 给非技术人员看的说明（看不懂术语请先读这里）
================================================================

  这个脚本模拟「很多老师同时用排课系统」的场景，测系统扛不扛得住。
  跑完会在 scripts/reports/ 下生成一份报告，告诉你「系统好不好用」。

  报告里会出现这些词，含义如下：

  · P50（中位数）  —— 一半的请求都在这个时间内完成。代表「正常速度」。
  · P95            —— 95% 的请求都在这个时间内完成。代表「大部分人的体验」。
  · P99            —— 99% 的请求都在这个时间内完成。剩下 1% 比这更慢。
                      P99 是重点看的数据，它一高就说明「有人卡住了」。
  · QPS（每秒请求数）—— 系统一秒能处理多少个请求。数字越大越能扛。
  · 错误率         —— 100 个请求里有几个失败。0% 最好，>1% 就要警惕。
  · 并发           —— 同一时刻有多少人在用。比如「并发 100」= 100 人同时点。
  · SLA（合格线）   —— P99 超过 1 秒、或错误率超过 1%，就判定「不达标」。
  · 衰减率         —— 跑久了会不会变慢。正数=变慢，负数=变快，越小越好。

  怎么看结果：
  · 看到「✓ 达标」= 这一关系统扛住了，正常。
  · 看到「✗ 不达标」= 这一关系统扛不住，需要关注。
  · 报告最后的「测试结果速读」会用大白话总结系统好不好用。

================================================================

【简易评估 quick】
  固定 200 学员规模下的多维度性能快照：
  D1 基础响应延迟 / D2 并发吞吐 / D3 DB查询 / D4 业务事务
  D5 报表聚合 / D6 搜索 / D7 鉴权 / D8 写吞吐 / D9 系统资源
  D10 课程/班级/班级成员 / D11 审计日志 / D12 反馈+教师绩效
  D13 点名（读列表+批量扣课+改缺勤）
  D14 排课写入（单条/批量/冲突检测）
  D15 退课（多表事务）
  D16 优化表查询（报名/账户流水/退课/调课/管理员）

【压力测试 stress】
  按标准 SLA 阶梯加压，找到「系统不好用」的边界：
  S1 数据量阶梯（100→500→1000→5000→10000 学员，含审计日志同步增长）
  S2 并发阶梯（10→50→100→200→500，找错误率 >1% 的崩溃点）
  S3 持续负载（固定 QPS 跑 3 分钟，测内存泄漏/性能衰减）
  S4 混合负载（读写 7:3，测真实场景瓶颈）
  S5 审计日志查询阶梯（深翻页/大页/按模块过滤，找审计表变慢拐点）
  S6 点名压力（50/100/200条批量扣课 + 并发点名）

  SLA 阈值：P99 > 1s 或 错误率 > 1% 或 CPU > 80% 判定「不好用」

测试完成后输出评估报告（控制台 + scripts/reports/perf_report_YYYYMMDD_HHMMSS.md）
"""

import json
import time
import statistics
import threading
import os
import sys
import argparse
import http.client as httplib
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlencode, urlparse

BASE = os.environ.get("PERF_BASE", "http://127.0.0.1:8788")
TOKEN = None
ADMIN_ID = None

# SLA 阈值定义
SLA_P99_MS = 1000        # P99 响应时间 > 1s 判定不达标
SLA_ERROR_RATE = 0.01    # 错误率 > 1% 判定不达标
SLA_CPU_PERCENT = 80     # CPU 占用 > 80% 判定不达标


# ============ HTTP 工具 ============
# 使用 http.client 长连接复用，避免 Windows 上 urlopen 短连接耗尽本地端口
# （WinError 10048: 通常每个套接字地址只允许使用一次）
# 每个线程维护一个独立的 HTTPConnection，避免多线程共享连接的并发问题

# 401 自动重登录的并发锁（多线程同时收到 401 时，只重登录一次）
_token_lock = threading.Lock()
# 每线程一个 HTTPConnection，复用 TCP 连接避免端口耗尽
_thread_conn = threading.local()


def _get_conn(timeout=30):
    """获取当前线程的 HTTP 连接（复用）。BASE 变更或连接断开时自动重建。"""
    parsed = urlparse(BASE)
    scheme = parsed.scheme or 'http'
    host = parsed.hostname or '127.0.0.1'
    port = parsed.port or (443 if scheme == 'https' else 80)
    key = (scheme, host, port)
    conn = getattr(_thread_conn, 'conn', None)
    cur_key = getattr(_thread_conn, 'key', None)
    if conn is None or cur_key != key:
        if conn is not None:
            try: conn.close()
            except Exception: pass
        if scheme == 'https':
            conn = httplib.HTTPSConnection(host, port, timeout=timeout)
        else:
            conn = httplib.HTTPConnection(host, port, timeout=timeout)
        _thread_conn.conn = conn
        _thread_conn.key = key
    conn.timeout = timeout
    return conn


def _close_conn():
    """关闭当前线程的连接（连接异常时调用，下次自动重建）"""
    conn = getattr(_thread_conn, 'conn', None)
    if conn is not None:
        try: conn.close()
        except Exception: pass
        _thread_conn.conn = None


def http(method, path, body=None, token=None, timeout=30, _allow_relogin=True, _retry=True):
    """发送 HTTP 请求，返回 (parsed_json, status_code)。
    每线程复用长连接，避免端口耗尽；连接异常自动重建并重试一次。
    收到 401 时自动重登录（多线程并发下只重登录一次）。
    """
    global TOKEN
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = json.dumps(body).encode("utf-8") if body is not None else None
    try:
        conn = _get_conn(timeout)
        conn.request(method, path, body=data, headers=headers)
        resp = conn.getresponse()
        raw = resp.read().decode("utf-8")
        status = resp.status
        try:
            r = json.loads(raw)
        except Exception:
            r = {"code": -1, "message": raw[:200]}
        # 401 自动重登录
        if status == 401 and token and _allow_relogin and ADMIN_USER:
            with _token_lock:
                if token != TOKEN:
                    new_token = TOKEN
                else:
                    try:
                        login()
                        new_token = TOKEN
                        print(f"  [诊断] token 失效(401)，已自动重新登录")
                    except Exception as login_err:
                        print(f"  [诊断] 自动重登录失败: {login_err}")
                        return r, status
            return http(method, path, body, token=new_token, timeout=timeout, _allow_relogin=False)
        return r, status
    except Exception as e:
        # 连接异常：关闭旧连接，下次重建；重试一次避免偶发断连
        _close_conn()
        if _retry:
            return http(method, path, body, token=token, timeout=timeout,
                        _allow_relogin=_allow_relogin, _retry=False)
        return {"code": -1, "message": str(e)[:200]}, 0


def measure(fn, n=1):
    """执行 n 次 fn，返回 (latencies_ms, success_count, error_count)"""
    lats = []
    ok = 0
    err = 0
    for _ in range(n):
        t0 = time.perf_counter()
        try:
            r, status = fn()
            if isinstance(r, dict) and r.get("code") == 0:
                ok += 1
            else:
                err += 1
        except Exception:
            err += 1
        lats.append((time.perf_counter() - t0) * 1000)
    return lats, ok, err


def measure_concurrent(fn, concurrency=10, total=100, timeout=30):
    """并发执行 total 次请求，concurrency 并发数"""
    lats = []
    ok = 0
    err = 0
    lock = threading.Lock()
    wall0 = time.perf_counter()

    def worker():
        nonlocal ok, err
        t0 = time.perf_counter()
        try:
            r, status = fn()
            if isinstance(r, dict) and r.get("code") == 0:
                with lock:
                    ok += 1
            else:
                with lock:
                    err += 1
        except Exception:
            with lock:
                err += 1
        with lock:
            lats.append((time.perf_counter() - t0) * 1000)

    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = [pool.submit(worker) for _ in range(total)]
        for f in as_completed(futures, timeout=timeout):
            try:
                f.result()
            except Exception:
                pass
    wall = time.perf_counter() - wall0
    return lats, ok, err, wall


def stats(lats):
    """计算延迟统计"""
    if not lats:
        return {"count": 0, "min_ms": 0, "avg_ms": 0, "p50_ms": 0, "p95_ms": 0, "p99_ms": 0, "max_ms": 0}
    lats_sorted = sorted(lats)
    n = len(lats_sorted)
    return {
        "count": n,
        "min_ms": round(lats_sorted[0], 2),
        "avg_ms": round(statistics.mean(lats_sorted), 2),
        "p50_ms": round(lats_sorted[int(n * 0.5)], 2),
        "p95_ms": round(lats_sorted[int(n * 0.95)], 2),
        "p99_ms": round(lats_sorted[min(int(n * 0.99), n - 1)], 2),
        "max_ms": round(lats_sorted[-1], 2),
    }


def qps(lats, wall_s):
    return round(len(lats) / wall_s, 1) if wall_s > 0 else 0


def error_rate(ok, err):
    total = ok + err
    return round(err / total * 100, 2) if total > 0 else 0


# ============ 测试数据准备 ============

# 测试账号：优先用命令行参数 / 环境变量，其次用默认值 admin/admin123
ADMIN_USER = os.environ.get("PERF_USER", "admin")
ADMIN_PASS = os.environ.get("PERF_PASS", "admin123")

def login(username=None, password=None):
    global TOKEN, ADMIN_ID
    u = username or ADMIN_USER
    p = password or ADMIN_PASS
    r, _ = http("POST", "/api/auth", {"username": u, "password": p})
    if r.get("code") != 0:
        raise Exception("登录失败: " + r.get("message", ""))
    TOKEN = r["data"]["token"]
    ADMIN_ID = r["data"]["admin"]["id"]
    print(f"[登录] 成功 admin={ADMIN_ID}（账号: {u}）")


def ensure_grade(name="一年级"):
    r, _ = http("GET", "/api/grades", token=TOKEN)
    if r.get("code") == 0:
        for g in r["data"].get("grades", []):
            if g["name"] == name:
                return g["id"]
    r, _ = http("POST", "/api/grade-add", {"grade": {"name": name, "sortOrder": 1}}, token=TOKEN)
    if r.get("code") == 0:
        return r["data"]["grade"]["id"]
    return None


def ensure_course(name="性能测试课程"):
    r, _ = http("GET", "/api/courses", token=TOKEN)
    if r.get("code") == 0:
        for c in r["data"].get("courses", []):
            if c["name"] == name:
                return c["id"]
    r, _ = http("POST", "/api/course-add", {"course": {"name": name, "billingType": "per_lesson", "grade": "一年级", "unitPrice": 100}}, token=TOKEN)
    if r.get("code") == 0:
        return r["data"]["course"]["id"]
    return None


def create_students(n, prefix="perf"):
    """批量创建 n 个学员，返回 id 列表"""
    ids = []
    for i in range(n):
        r, _ = http("POST", "/api/student-add", {"student": {
            "name": f"{prefix}_{i:05d}",
            "phone": f"138{i:08d}",
            "grade": "一年级",
        }}, token=TOKEN)
        if r.get("code") == 0:
            ids.append(r["data"]["student"]["id"])
    return ids


def create_enrollment(student_id, course_id, hours=10):
    r, _ = http("POST", "/api/enrollment-add", {"enrollment": {
        "studentId": student_id,
        "courseId": course_id,
        "purchasedHours": hours,
        "giftHours": 2,
        "unitPrice": 100,
        "totalAmount": hours * 100,
        "paidAmount": hours * 100,
    }}, token=TOKEN)
    return r.get("code") == 0


def get_perf_students():
    """获取所有 perf_ 开头的学员"""
    r, _ = http("GET", "/api/students?q=perf_", token=TOKEN)
    if r.get("code") == 0:
        return r["data"].get("students", [])
    return []


def ensure_class(name, course_id):
    """创建或获取班级"""
    r, _ = http("GET", "/api/classes", token=TOKEN)
    if r.get("code") == 0:
        for c in r["data"].get("classes", []):
            if c["name"] == name:
                return c["id"]
    r, _ = http("POST", "/api/class-add", {"class": {
        "name": name, "courseId": course_id, "grade": "一年级", "teacher": "测试教师", "capacity": 50,
    }}, token=TOKEN)
    if r.get("code") == 0:
        return r["data"]["class"]["id"]
    return None


def add_class_members(class_id, student_ids):
    """批量添加班级成员（最多 500 条一次）"""
    if not student_ids:
        return 0
    added = 0
    for i in range(0, len(student_ids), 500):
        batch = student_ids[i:i+500]
        r, _ = http("POST", "/api/class-members", {"classId": class_id, "studentIds": batch}, token=TOKEN)
        if r.get("code") == 0:
            added += r["data"].get("added", 0)
    return added


def create_feedback(student_id, schedule_id, teacher_id=""):
    """创建课后反馈（后端 /api/feedback 直接读整个 body 作为 feedback 对象，不要外层包装）"""
    r, _ = http("POST", "/api/feedback", {
        "scheduleId": schedule_id,
        "studentId": student_id,
        "teacherId": teacher_id,
        "content": "测试反馈内容",
        "rating": 5,
    }, token=TOKEN)
    return r.get("code") == 0


def create_schedule(student_id, course_id, class_id="", date=None, course_name="性能测试课程", student_name=""):
    """创建单条排课"""
    if date is None:
        date = time.strftime("%Y-%m-%d")
    if not class_id:
        class_id = "none"
    if not student_name:
        student_name = f"perf_{student_id[:8]}"
    r, _ = http("POST", "/api/schedule-add", {"schedule": {
        "studentId": student_id,
        "courseId": course_id,
        "courseName": course_name,
        "classId": class_id,
        "studentName": student_name,
        "date": date,
        "startTime": "09:00",
        "endTime": "10:00",
    }}, token=TOKEN)
    if r.get("code") == 0:
        return r["data"]["schedule"]["id"]
    return None


def batch_add_schedules(student_ids, course_id, dates, start_time="09:00", end_time="10:00", class_id="", course_name="性能测试课程"):
    """批量排课（一次 API 调用）"""
    if not student_ids or not dates:
        return 0
    if not class_id:
        class_id = "none"
    r, _ = http("POST", "/api/schedule-add-batch", {
        "studentIds": student_ids,
        "courseId": course_id,
        "courseName": course_name,
        "classId": class_id,
        "dates": dates,
        "startTime": start_time,
        "endTime": end_time,
    }, token=TOKEN, timeout=60)
    if r.get("code") == 0:
        return r["data"].get("created", 0)
    return 0


def set_attendance(items, date=None):
    """批量点名（items: [{scheduleId, studentId, attended}]）
    API 要求必传 date（yyyy-MM-dd），缺 date 会返回 400
    返回 (response_dict, status) —— measure() 期望 fn 返回元组
    """
    if not items:
        return {"code": 0, "data": {"updatedSchedules": 0}}, 200
    if not date:
        # 从 items 中第一条的 date 字段取（S6 已统一补 date）；fallback 用今天
        date = items[0].get("date") or time.strftime("%Y-%m-%d")
    r, st = http("POST", "/api/attendance", {"date": date, "items": items}, token=TOKEN, timeout=60)
    return r, st


def create_transfer(student_id, from_enrollment_id, reason="测试退课"):
    """退课"""
    r, _ = http("POST", "/api/transfer-add", {"transfer": {
        "studentId": student_id,
        "fromEnrollmentId": from_enrollment_id,
        "reason": reason,
    }}, token=TOKEN)
    return r.get("code") == 0


# ============ D1-D9 简易评估（固定规模快照） ============

def d1_basic_latency():
    print("\n" + "=" * 60)
    print("  D1 基础响应延迟（冷/热、公开/鉴权）")
    print("  测什么：点开页面/刷新列表时，系统多快能响应。越快越流畅。")
    print("=" * 60)
    results = {}

    lats_cold, _, _ = measure(lambda: http("GET", "/api/config"), 1)
    lats_hot, _, _ = measure(lambda: http("GET", "/api/config"), 100)
    lats_ann, _, _ = measure(lambda: http("GET", "/api/announcement"), 100)
    lats_auth, _, _ = measure(lambda: http("GET", "/api/auth", token=TOKEN), 100)
    lats_students, _, _ = measure(lambda: http("GET", "/api/students", token=TOKEN), 50)

    s_hot = stats(lats_hot)
    s_ann = stats(lats_ann)
    s_auth = stats(lats_auth)
    s_stu = stats(lats_students)

    print(f"  配置接口(冷)    {stats(lats_cold)['avg_ms']} ms")
    print(f"  配置接口(热)    {s_hot}")
    print(f"  公告接口        {s_ann}")
    print(f"  鉴权校验(/auth) {s_auth}")
    print(f"  学员列表        {s_stu}")

    results["配置接口P95"] = s_hot["p95_ms"]
    results["鉴权P95"] = s_auth["p95_ms"]
    results["学员列表P95"] = s_stu["p95_ms"]
    return results


def d2_concurrency():
    print("\n" + "=" * 60)
    print("  D2 并发吞吐量（不同并发数）")
    print("  测什么：同时有很多人用时，系统一秒能处理多少请求、会不会卡。")
    print("=" * 60)
    results = {}

    for conc in [1, 5, 10, 20, 50]:
        lats, ok, err, wall = measure_concurrent(
            lambda: http("GET", "/api/config"), concurrency=conc, total=200,
        )
        s = stats(lats)
        q = qps(lats, wall)
        er = error_rate(ok, err)
        print(f"  并发={conc:3d}  QPS={q:6.1f}  P50={s['p50_ms']:6.2f}ms  P95={s['p95_ms']:6.2f}ms  P99={s['p99_ms']:6.2f}ms  错误率={er}%")
        results[f"公开接口并发{conc}_QPS"] = q
        results[f"公开接口并发{conc}_P99"] = s["p99_ms"]

    print("\n  --- 鉴权接口并发 ---")
    for conc in [1, 10, 20]:
        lats, ok, err, wall = measure_concurrent(
            lambda: http("GET", "/api/auth", token=TOKEN), concurrency=conc, total=100,
        )
        s = stats(lats)
        q = qps(lats, wall)
        er = error_rate(ok, err)
        print(f"  鉴权并发={conc:3d}  QPS={q:6.1f}  P50={s['p50_ms']:6.2f}ms  P95={s['p95_ms']:6.2f}ms  错误率={er}%")
        results[f"鉴权并发{conc}_QPS"] = q
        results[f"鉴权并发{conc}_P95"] = s["p95_ms"]

    return results


def d3_db_query(student_ids):
    print("\n" + "=" * 60)
    print("  D3 数据库查询性能（按学员查排课）")
    print("  测什么：查某个学员的排课时，数据库查得多快。这是最常用的操作之一。")
    print("=" * 60)
    results = {}
    if not student_ids:
        print("  [跳过] 无学员数据")
        return results

    import random
    lats, _, _ = measure(lambda: http("GET", f"/api/schedules?studentId={student_ids[0]}"), 50)
    s = stats(lats)
    print(f"  单学员排课  {s}")
    results["单学员排课P95"] = s["p95_ms"]

    lats, ok, err, wall = measure_concurrent(
        lambda: http("GET", f"/api/schedules?studentId={random.choice(student_ids)}"),
        concurrency=20, total=200,
    )
    s = stats(lats)
    print(f"  并发20查排课  QPS={qps(lats, wall):.1f}  {s}")
    results["并发20查排课QPS"] = qps(lats, wall)
    return results


def d4_business_tx(student_ids, course_id):
    print("\n" + "=" * 60)
    print("  D4 业务事务性能（报名/点名/退课）")
    print("  测什么：给学员报名这种「写操作」要多快。涉及多张表，比纯查询慢。")
    print("=" * 60)
    results = {}
    if not student_ids or not course_id:
        print("  [跳过] 缺数据")
        return results

    sample = student_ids[:20]
    lats = []
    for sid in sample:
        t0 = time.perf_counter()
        create_enrollment(sid, course_id, hours=20)
        lats.append((time.perf_counter() - t0) * 1000)
    s = stats(lats)
    print(f"  创建报名(单条)  {s}")
    results["创建报名P95"] = s["p95_ms"]
    return results


def d5_reports():
    print("\n" + "=" * 60)
    print("  D5 报表聚合性能（6 种报表）")
    print("  测什么：月底看营收/课时/出勤等报表时，系统算得快不快。")
    print("=" * 60)
    results = {}
    today = time.strftime("%Y-%m-%d")
    month_start = today[:8] + "01"
    for rtype, label in [
        ("revenue", "营收"), ("hours-consumption", "课时消耗"),
        ("hours-balance", "课时余额"), ("attendance-rate", "出勤率"),
        ("transfers", "结转"), ("enrollment-stats", "报名统计"),
    ]:
        params = urlencode({"type": rtype, "startDate": month_start, "endDate": today})
        lats, ok, err = measure(lambda: http("GET", f"/api/reports?{params}", token=TOKEN), 10)
        s = stats(lats)
        print(f"  {label:6s}  P50={s['p50_ms']:.2f}ms  P95={s['p95_ms']:.2f}ms  错误率={error_rate(ok,err)}%")
        results[f"{label}报表P95"] = s["p95_ms"]
    return results


def d6_search(student_ids):
    print("\n" + "=" * 60)
    print("  D6 搜索性能")
    print("  测什么：在搜索框输入名字找学员时，多快能出结果。")
    print("=" * 60)
    results = {}
    if not student_ids:
        print("  [跳过] 无数据")
        return results

    lats, _, _ = measure(lambda: http("GET", "/api/students?q=perf_00000"), 50)
    s = stats(lats)
    print(f"  精确搜索      {s}")
    results["精确搜索P95"] = s["p95_ms"]

    lats, _, _ = measure(lambda: http("GET", "/api/students?q=perf_0"), 50)
    s = stats(lats)
    print(f"  模糊前缀搜索  {s}")
    results["模糊搜索P95"] = s["p95_ms"]

    lats, _, _ = measure(lambda: http("GET", "/api/students?q="), 20)
    s = stats(lats)
    print(f"  全量学员列表  {s}")
    results["全量列表P95"] = s["p95_ms"]
    return results


def d7_auth():
    print("\n" + "=" * 60)
    print("  D7 鉴权性能")
    print("  测什么：每次操作都要校验登录状态，这个校验本身会不会拖慢系统。")
    print("=" * 60)
    results = {}
    lats, _, _ = measure(lambda: http("GET", "/api/auth", token=TOKEN), 200)
    s = stats(lats)
    print(f"  /api/auth(查库)  {s}")
    results["鉴权P99"] = s["p99_ms"]

    lats, _, _ = measure(lambda: http("GET", "/api/auth", token="invalid.token"), 50)
    s = stats(lats)
    print(f"  错误token拒绝   {s}")
    results["错误token拒绝P95"] = s["p95_ms"]
    return results


def d8_write_throughput(course_id):
    print("\n" + "=" * 60)
    print("  D8 写操作吞吐量")
    print("  测什么：连续新增学员时，一秒能写多少条。反映系统的写入能力。")
    print("=" * 60)
    results = {}
    lats = []
    for i in range(50):
        t0 = time.perf_counter()
        http("POST", "/api/student-add", {"student": {"name": f"write_{i:04d}", "phone": f"139{i:07d}", "grade": "一年级"}}, token=TOKEN)
        lats.append((time.perf_counter() - t0) * 1000)
    s = stats(lats)
    ops = qps(lats, sum(lats) / 1000)
    print(f"  串行新增学员(50)  P50={s['p50_ms']:.2f}ms  吞吐={ops:.1f} ops/s")
    results["串行写吞吐"] = ops
    return results


def d9_system():
    print("\n" + "=" * 60)
    print("  D9 系统资源占用")
    print("  测什么：跑业务时服务器 CPU/内存占用多少。太高说明要加配置。")
    print("=" * 60)
    results = {}
    is_remote = not BASE.startswith("http://127.0.0.1") and not BASE.startswith("http://localhost")

    if is_remote:
        # 远程测试：无法直接读进程/数据库，用 API 延迟推断负载
        print("  [远程测试] 无法直接采集服务器资源，改用 API 延迟推断")
        lats, _, _ = measure(lambda: http("GET", "/api/config"), 30)
        s = stats(lats)
        print(f"  配置接口延迟  P50={s['p50_ms']:.2f}ms  P99={s['p99_ms']:.2f}ms")
        # 延迟显著高于本机基线（>100ms）可能意味着高负载
        if s["p99_ms"] > 100:
            results["远程延迟告警"] = s["p99_ms"]
            print(f"  ⚠ P99={s['p99_ms']:.0f}ms 高于 100ms，服务器可能高负载")
        results["配置接口P99"] = s["p99_ms"]
        return results

    # 本机测试：直接采集进程/数据库资源
    import subprocess
    try:
        result = subprocess.run(["ps", "aux"], capture_output=True, text=True, timeout=5)
        for line in result.stdout.split("\n"):
            if "node server" in line and "grep" not in line:
                parts = line.split()
                if len(parts) >= 6:
                    cpu, mem, rss = parts[2], parts[3], parts[5]
                    print(f"  node 进程  CPU={cpu}%  MEM={mem}%  RSS={rss}KB")
                    results["CPU占用"] = float(cpu)
                    results["内存占用"] = float(mem)
    except Exception:
        pass

    db_path = "/workspace/data/pai.db"
    if os.path.exists(db_path):
        size = os.path.getsize(db_path)
        print(f"  数据库文件  {size / 1024:.1f} KB")
        results["DB大小KB"] = round(size / 1024, 1)
    return results


# ============ D10-D12 其他表性能测试 ============

def d10_courses_classes(student_ids, course_id):
    """D10 课程/班级/班级成员查询性能"""
    print("\n" + "=" * 60)
    print("  D10 课程/班级/班级成员查询性能")
    print("  测什么：查课程、班级、班级成员、按课程/班级查排课，快不快。")
    print("=" * 60)
    results = {}
    if not course_id:
        print("  [跳过] 无课程数据")
        return results

    # 课程列表
    lats, _, _ = measure(lambda: http("GET", "/api/courses", token=TOKEN), 50)
    s = stats(lats)
    print(f"  课程列表        {s}")
    results["课程列表P95"] = s["p95_ms"]

    # 班级列表
    lats, _, _ = measure(lambda: http("GET", "/api/classes", token=TOKEN), 50)
    s = stats(lats)
    print(f"  班级列表        {s}")
    results["班级列表P95"] = s["p95_ms"]

    # 按课程查排课（schedules-search?courseId=）
    lats, _, _ = measure(lambda: http("GET", f"/api/schedules-search?courseId={course_id}", token=TOKEN), 30)
    s = stats(lats)
    print(f"  按课程查排课    {s}")
    results["按课程查排课P95"] = s["p95_ms"]

    # 班级成员查询（如果有班级）
    r, _ = http("GET", "/api/classes", token=TOKEN)
    classes = r.get("data", {}).get("classes", []) if r.get("code") == 0 else []
    if classes:
        class_id = classes[0]["id"]
        lats, _, _ = measure(lambda: http("GET", f"/api/class-members?classId={class_id}", token=TOKEN), 30)
        s = stats(lats)
        print(f"  班级成员查询    {s}")
        results["班级成员查询P95"] = s["p95_ms"]

        # 按班级查排课
        lats, _, _ = measure(lambda: http("GET", f"/api/schedules-search?classId={class_id}", token=TOKEN), 30)
        s = stats(lats)
        print(f"  按班级查排课    {s}")
        results["按班级查排课P95"] = s["p95_ms"]
    else:
        print("  [跳过] 无班级数据，未测班级成员/按班级查排课")
    return results


def d11_audit_logs():
    """D11 审计日志查询性能"""
    print("\n" + "=" * 60)
    print("  D11 审计日志查询性能")
    print("  测什么：查「谁在什么时候做了什么」的操作记录，快不快。日志会越积越多。")
    print("=" * 60)
    results = {}

    # 全量查询（第一页）
    lats, _, _ = measure(lambda: http("GET", "/api/audit-logs?page=1&pageSize=20", token=TOKEN), 30)
    s = stats(lats)
    print(f"  审计日志(首页20条)  {s}")
    results["审计首页P95"] = s["p95_ms"]

    # 按模块查询
    lats, _, _ = measure(lambda: http("GET", "/api/audit-logs?module=students&page=1&pageSize=20", token=TOKEN), 30)
    s = stats(lats)
    print(f"  按模块查询(students) {s}")
    results["按模块查询P95"] = s["p95_ms"]

    # 按操作人查询
    lats, _, _ = measure(lambda: http("GET", f"/api/audit-logs?actorId={ADMIN_ID}&page=1&pageSize=20", token=TOKEN), 30)
    s = stats(lats)
    print(f"  按操作人查询        {s}")
    results["按操作人查询P95"] = s["p95_ms"]

    # 大页查询（pageSize=100）
    lats, _, _ = measure(lambda: http("GET", "/api/audit-logs?page=1&pageSize=100", token=TOKEN), 20)
    s = stats(lats)
    print(f"  大页查询(100条)     {s}")
    results["大页查询P95"] = s["p95_ms"]

    # 深翻页（第 100 页）
    lats, _, _ = measure(lambda: http("GET", "/api/audit-logs?page=100&pageSize=20", token=TOKEN), 20)
    s = stats(lats)
    print(f"  深翻页(第100页)     {s}")
    results["深翻页P95"] = s["p95_ms"]
    return results


def d12_feedback_perf(student_ids, course_id):
    """D12 课后反馈查询 + 教师绩效性能"""
    print("\n" + "=" * 60)
    print("  D12 课后反馈查询 + 教师绩效性能")
    print("  测什么：查课后反馈和老师绩效报表，快不快。")
    print("=" * 60)
    results = {}
    if not student_ids or not course_id:
        print("  [跳过] 缺数据")
        return results

    # 反馈列表查询
    lats, _, _ = measure(lambda: http("GET", "/api/feedback", token=TOKEN), 30)
    s = stats(lats)
    print(f"  反馈列表查询        {s}")
    results["反馈列表P95"] = s["p95_ms"]

    # 按课程查反馈
    lats, _, _ = measure(lambda: http("GET", f"/api/feedback?courseId={course_id}", token=TOKEN), 30)
    s = stats(lats)
    print(f"  按课程查反馈        {s}")
    results["按课程查反馈P95"] = s["p95_ms"]

    # 按学员查反馈
    lats, _, _ = measure(lambda: http("GET", f"/api/feedback?studentId={student_ids[0]}", token=TOKEN), 30)
    s = stats(lats)
    print(f"  按学员查反馈        {s}")
    results["按学员查反馈P95"] = s["p95_ms"]

    # 教师绩效
    today = time.strftime("%Y-%m-%d")
    month_start = today[:8] + "01"
    params = urlencode({"startDate": month_start, "endDate": today})
    lats, _, _ = measure(lambda: http("GET", f"/api/teacher-performance?{params}", token=TOKEN), 20)
    s = stats(lats)
    print(f"  教师绩效            {s}")
    results["教师绩效P95"] = s["p95_ms"]
    return results


def d13_attendance(student_ids, course_id):
    """D13 点名性能（读点名列表 + 批量点名扣课）"""
    print("\n" + "=" * 60)
    print("  D13 点名性能（读列表 + 批量扣课）")
    print("  测什么：上课点名时，读名单、批量扣课时、改缺勤退课时，要多快。")
    print("=" * 60)
    results = {}
    if not student_ids or not course_id:
        print("  [跳过] 缺数据")
        return results

    today = time.strftime("%Y-%m-%d")
    # 创建班级（schedule-add 要求 classId 在班级表中存在）
    class_id = ensure_class("点名测试班", course_id)
    if not class_id:
        print("  [跳过] 班级创建失败")
        return results

    # 先为部分学员创建报名 + 今天的排课，供点名用
    sample = student_ids[:50]
    print(f"  准备：为 {len(sample)} 个学员创建报名+今日排课...")
    for sid in sample:
        create_enrollment(sid, course_id, hours=20)
    sched_ids = []
    for sid in sample:
        sid_sched = create_schedule(sid, course_id, class_id=class_id, date=today)
        if sid_sched:
            sched_ids.append((sid, sid_sched))

    if not sched_ids:
        print("  [跳过] 排课创建失败")
        return results

    # 1. 点名 GET（读取当日点名列表）
    lats, _, _ = measure(lambda: http("GET", f"/api/attendance?date={today}", token=TOKEN), 30)
    s = stats(lats)
    print(f"  点名列表GET(50条)   {s}")
    results["点名列表GET_P95"] = s["p95_ms"]

    # 2. 点名 POST（批量扣课，50条）—— items 需含 scheduleId + studentId + attended
    items = [{"scheduleId": sid_sched, "studentId": sid, "attended": True, "date": today}
             for sid, sid_sched in sched_ids]
    lats = []
    for _ in range(5):
        t0 = time.perf_counter()
        set_attendance(items, date=today)
        lats.append((time.perf_counter() - t0) * 1000)
    s = stats(lats)
    print(f"  批量点名POST(50条)  {s}")
    results["批量点名50条_P95"] = s["p95_ms"]

    # 3. 改缺勤（回退课时）
    undo_items = [{"scheduleId": sid_sched, "studentId": sid, "attended": False, "date": today}
                  for sid, sid_sched in sched_ids[:20]]
    lats = []
    for _ in range(5):
        t0 = time.perf_counter()
        set_attendance(undo_items, date=today)
        lats.append((time.perf_counter() - t0) * 1000)
    s = stats(lats)
    print(f"  改缺勤POST(20条)    {s}")
    results["改缺勤20条_P95"] = s["p95_ms"]

    return results


def d14_schedule_write(student_ids, course_id):
    """D14 排课写入性能（单条 + 批量 + 冲突检测）"""
    print("\n" + "=" * 60)
    print("  D14 排课写入性能（单条/批量/冲突检测）")
    print("  测什么：排一节课、批量排多节课、检测时间冲突，要多快。")
    print("=" * 60)
    results = {}
    if not student_ids or not course_id:
        print("  [跳过] 缺数据")
        return results

    # 创建班级 + 报名（排课前置条件）
    class_id = ensure_class("排课测试班", course_id)
    sample = student_ids[:50]
    for sid in sample:
        create_enrollment(sid, course_id, hours=20)
    # 后端 /api/schedule-add-batch 校验学员必须是班级成员，先加入班级
    add_class_members(class_id, sample)

    tomorrow = time.strftime("%Y-%m-%d", time.localtime(time.time() + 86400))

    # 1. 单条排课（含冲突检测）
    single_sample = sample[:20]
    lats = []
    for sid in single_sample:
        t0 = time.perf_counter()
        create_schedule(sid, course_id, class_id=class_id, date=tomorrow)
        lats.append((time.perf_counter() - t0) * 1000)
    s = stats(lats)
    print(f"  单条排课(含冲突检测)  {s}")
    results["单条排课P95"] = s["p95_ms"]

    # 2. 批量排课（50学员 × 1天）
    lats = []
    for i in range(3):
        day = time.strftime("%Y-%m-%d", time.localtime(time.time() + 86400 * (2 + i)))
        t0 = time.perf_counter()
        batch_add_schedules(sample, course_id, [day], class_id=class_id)
        lats.append((time.perf_counter() - t0) * 1000)
    s = stats(lats)
    print(f"  批量排课(50人×1天)    {s}")
    results["批量排课50人_P95"] = s["p95_ms"]

    # 3. 批量排课（50学员 × 10天，N×M 冲突检测）
    dates = [time.strftime("%Y-%m-%d", time.localtime(time.time() + 86400 * (5 + i))) for i in range(10)]
    t0 = time.perf_counter()
    batch_add_schedules(sample, course_id, dates, class_id=class_id)
    lat = (time.perf_counter() - t0) * 1000
    print(f"  批量排课(50人×10天)   {lat:.2f}ms")
    results["批量排课50人10天"] = round(lat, 2)

    return results


def d15_transfer(student_ids, course_id):
    """D15 退课性能（多表事务）"""
    print("\n" + "=" * 60)
    print("  D15 退课性能（多表事务）")
    print("  测什么：退课要同时改报名、账户余额、排课等多张表，测这个事务快不快。")
    print("=" * 60)
    results = {}
    if not student_ids or not course_id:
        print("  [跳过] 缺数据")
        return results

    # 先为测试学员创建报名（带课时）
    sample = student_ids[:10]
    enr_ids = []
    for sid in sample:
        r, _ = http("POST", "/api/enrollment-add", {"enrollment": {
            "studentId": sid, "courseId": course_id,
            "purchasedHours": 10, "giftHours": 2,
            "unitPrice": 100, "totalAmount": 1000, "paidAmount": 1000,
        }}, token=TOKEN)
        if r.get("code") == 0:
            enr_ids.append((sid, r["data"]["enrollment"]["id"]))

    if not enr_ids:
        print("  [跳过] 报名创建失败")
        return results

    # 退课（多表事务：transfers + enrollments + account_transactions + schedules）
    lats = []
    for sid, eid in enr_ids:
        t0 = time.perf_counter()
        create_transfer(sid, eid)
        lats.append((time.perf_counter() - t0) * 1000)
    s = stats(lats)
    print(f"  退课(多表事务)  {s}")
    results["退课P95"] = s["p95_ms"]

    return results


def d16_optimized_tables(student_ids):
    """D16 优化后的表查询性能（验证 datetime() 修复效果）"""
    print("\n" + "=" * 60)
    print("  D16 优化表查询（报名/账户流水/退课/调课/管理员）")
    print("  测什么：查报名记录、账户流水、退课流水、调课记录、管理员列表，快不快。")
    print("=" * 60)
    results = {}
    if not student_ids:
        print("  [跳过] 缺数据")
        return results

    sid = student_ids[0]

    # 1. 报名记录查询
    lats, _, _ = measure(lambda: http("GET", f"/api/enrollments?studentId={sid}", token=TOKEN), 30)
    s = stats(lats)
    print(f"  报名记录查询        {s}")
    results["报名记录P95"] = s["p95_ms"]

    # 2. 账户流水查询
    lats, _, _ = measure(lambda: http("GET", f"/api/account-transactions?studentId={sid}", token=TOKEN), 30)
    s = stats(lats)
    print(f"  账户流水查询        {s}")
    results["账户流水P95"] = s["p95_ms"]

    # 3. 退课流水查询
    lats, _, _ = measure(lambda: http("GET", f"/api/transfers?studentId={sid}", token=TOKEN), 30)
    s = stats(lats)
    print(f"  退课流水查询        {s}")
    results["退课流水P95"] = s["p95_ms"]

    # 4. 调课记录查询
    lats, _, _ = measure(lambda: http("GET", f"/api/schedule-changes?studentId={sid}", token=TOKEN), 30)
    s = stats(lats)
    print(f"  调课记录查询        {s}")
    results["调课记录P95"] = s["p95_ms"]

    # 5. 管理员列表
    lats, _, _ = measure(lambda: http("GET", "/api/admins", token=TOKEN), 30)
    s = stats(lats)
    print(f"  管理员列表          {s}")
    results["管理员列表P95"] = s["p95_ms"]

    return results


# ============ S1-S4 压力测试（SLA 阶梯） ============

def s1_data_volume_staircase(course_id):
    """S1 数据量阶梯：逐步加学员，找查询变慢拐点"""
    print("\n" + "=" * 60)
    print("  S1 数据量阶梯测试（找查询变慢拐点）")
    print(f"  SLA: P99 > {SLA_P99_MS}ms 判定不达标")
    print("  测什么：学员从 100 涨到 10000，查询会不会变慢。找「开始卡」的学员数。")
    print("=" * 60)
    results = []
    target_sizes = [100, 500, 1000, 5000, 10000]

    for target in target_sizes:
        # 补齐学员到目标数
        current = len(get_perf_students())
        if current < target:
            need = target - current
            print(f"\n  [规模 {target}] 补充 {need} 个学员...")
            created = create_students(need)
            # 为新增学员创建报名
            for sid in created:
                create_enrollment(sid, course_id, hours=20)

        all_students = get_perf_students()
        actual = len(all_students)
        print(f"\n  [规模 {actual}] 开始测试...")

        # 测全量列表
        lats, ok, err = measure(lambda: http("GET", "/api/students?q=", token=TOKEN), 5)
        s = stats(lats)
        er = error_rate(ok, err)

        # 测模糊搜索
        lats_search, ok2, err2 = measure(lambda: http("GET", "/api/students?q=perf", token=TOKEN), 5)
        s_search = stats(lats_search)

        # 测报表
        today = time.strftime("%Y-%m-%d")
        month_start = today[:8] + "01"
        params = urlencode({"type": "revenue", "startDate": month_start, "endDate": today})
        lats_rep, ok3, err3 = measure(lambda: http("GET", f"/api/reports?{params}", token=TOKEN), 5)
        s_rep = stats(lats_rep)

        # 测审计日志（随学员/报名/排课写入同步增长，是最易膨胀的表）
        lats_audit, ok_a, err_a = measure(lambda: http("GET", "/api/audit-logs?page=1&pageSize=20", token=TOKEN), 5)
        s_audit = stats(lats_audit)

        passed = s["p99_ms"] < SLA_P99_MS and s_search["p99_ms"] < SLA_P99_MS and s_rep["p99_ms"] < SLA_P99_MS and s_audit["p99_ms"] < SLA_P99_MS and er < SLA_ERROR_RATE * 100

        print(f"  全量列表  P50={s['p50_ms']:.2f}ms  P99={s['p99_ms']:.2f}ms")
        print(f"  模糊搜索  P50={s_search['p50_ms']:.2f}ms  P99={s_search['p99_ms']:.2f}ms")
        print(f"  营收报表  P50={s_rep['p50_ms']:.2f}ms  P99={s_rep['p99_ms']:.2f}ms")
        print(f"  审计日志  P50={s_audit['p50_ms']:.2f}ms  P99={s_audit['p99_ms']:.2f}ms")
        print(f"  错误率={er}%  {'✓ 达标' if passed else '✗ 不达标'}")

        results.append({
            "规模": actual,
            "全量列表P99": s["p99_ms"],
            "模糊搜索P99": s_search["p99_ms"],
            "报表P99": s_rep["p99_ms"],
            "审计P99": s_audit["p99_ms"],
            "错误率": er,
            "达标": passed,
        })

        if not passed:
            print(f"\n  ⚠️  在 {actual} 学员规模下 P99 超过 {SLA_P99_MS}ms，系统开始不好用")
            break

    return results


def s2_concurrency_staircase():
    """S2 并发阶梯：逐步加并发，找错误率 >1% 的崩溃点"""
    print("\n" + "=" * 60)
    print("  S2 并发阶梯测试（找崩溃临界点）")
    print(f"  SLA: 错误率 > {SLA_ERROR_RATE*100}% 或 P99 > {SLA_P99_MS}ms 判定不达标")
    print("  测什么：同时 10/50/100/200/500 人用，系统会不会崩。找「开始出错」的人数。")
    print("=" * 60)
    results = []
    conc_levels = [10, 50, 100, 200, 500]

    for conc in conc_levels:
        total = max(conc * 2, 100)
        print(f"\n  [并发 {conc}] 发送 {total} 个请求...")
        lats, ok, err, wall = measure_concurrent(
            lambda: http("GET", "/api/config"), concurrency=conc, total=total, timeout=60,
        )
        s = stats(lats)
        q = qps(lats, wall)
        er = error_rate(ok, err)
        passed = er < SLA_ERROR_RATE * 100 and s["p99_ms"] < SLA_P99_MS

        print(f"  QPS={q:.1f}  P50={s['p50_ms']:.2f}ms  P95={s['p95_ms']:.2f}ms  P99={s['p99_ms']:.2f}ms  错误率={er}%  {'✓' if passed else '✗'}")

        results.append({
            "并发": conc,
            "QPS": q,
            "P99": s["p99_ms"],
            "错误率": er,
            "达标": passed,
        })

        if not passed:
            print(f"\n  ⚠️  在并发 {conc} 时系统开始不好用（错误率={er}% 或 P99={s['p99_ms']:.0f}ms）")
            break

    return results


def s3_sustained_load(duration_s=180):
    """S3 持续负载：固定 QPS 跑 3 分钟，测性能衰减"""
    print("\n" + "=" * 60)
    print(f"  S3 持续负载测试（{duration_s}s，测性能衰减）")
    print("  测什么：连续跑 3 分钟，看系统会不会越跑越慢（内存泄漏/卡顿）。")
    print("=" * 60)
    results = []
    target_qps = 100  # 目标 100 QPS 持续跑
    interval = 1.0 / target_qps
    samples = []
    start = time.perf_counter()

    stop = threading.Event()
    latencies = []
    ok_count = [0]
    err_count = [0]
    lock = threading.Lock()

    def worker():
        while not stop.is_set():
            t0 = time.perf_counter()
            try:
                r, _ = http("GET", "/api/config", timeout=5)
                with lock:
                    if r.get("code") == 0:
                        ok_count[0] += 1
                    else:
                        err_count[0] += 1
                    latencies.append((time.perf_counter() - t0) * 1000)
            except Exception:
                with lock:
                    err_count[0] += 1
                    latencies.append((time.perf_counter() - t0) * 1000)
            time.sleep(interval)

    # 5 个并发线程达到 100 QPS
    threads = [threading.Thread(target=worker, daemon=True) for _ in range(5)]
    for t in threads:
        t.start()

    # 每 20 秒采样一次
    sample_count = 0
    while time.perf_counter() - start < duration_s:
        time.sleep(20)
        sample_count += 1
        elapsed = time.perf_counter() - start
        with lock:
            snap = list(latencies[-200:])  # 取最近 200 个
            cur_ok = ok_count[0]
            cur_err = err_count[0]
        s = stats(snap) if snap else stats([])
        er = error_rate(cur_ok, cur_err)
        cur_qps = round(len(latencies) / elapsed, 1)
        passed = s["p99_ms"] < SLA_P99_MS and er < SLA_ERROR_RATE * 100
        print(f"  [{int(elapsed):3d}s] QPS={cur_qps:.1f}  P50={s['p50_ms']:.2f}ms  P95={s['p95_ms']:.2f}ms  P99={s['p99_ms']:.2f}ms  错误率={er}%  {'✓' if passed else '✗'}")
        samples.append({"时间s": int(elapsed), "QPS": cur_qps, "P99": s["p99_ms"], "错误率": er, "达标": passed})

    stop.set()
    for t in threads:
        t.join(timeout=2)

    # 分析衰减趋势
    if len(samples) >= 2:
        first_p99 = samples[0]["P99"]
        last_p99 = samples[-1]["P99"]
        degradation = round((last_p99 - first_p99) / first_p99 * 100, 1) if first_p99 > 0 else 0
        print(f"\n  P99 衰减: {first_p99:.2f}ms → {last_p99:.2f}ms ({'+' if degradation>0 else ''}{degradation}%)")
        results = {"samples": samples, "衰减率%": degradation, "首段P99": first_p99, "末段P99": last_p99}
    return results


def s4_mixed_load(student_ids, course_id, duration_s=120):
    """S4 混合负载：读写 7:3"""
    print("\n" + "=" * 60)
    print(f"  S4 混合负载测试（读写 7:3，{duration_s}s）")
    print("  测什么：模拟真实使用——7 成人在看、3 成人在写，看系统扛不扛得住。")
    print("=" * 60)
    import random
    results = {}

    if not student_ids:
        print("  [跳过] 无学员数据")
        return results

    stop = threading.Event()
    read_lats = []
    write_lats = []
    read_ok = [0]
    read_err = [0]
    write_ok = [0]
    write_err = [0]
    lock = threading.Lock()
    # 错误诊断计数器：每个 worker 最多打印 2 次错误详情，避免刷屏
    diag_read = [0]
    diag_write = [0]

    def read_worker():
        while not stop.is_set():
            t0 = time.perf_counter()
            try:
                sid = random.choice(student_ids)
                r, _ = http("GET", f"/api/schedules?studentId={sid}", token=TOKEN, timeout=5)
                with lock:
                    if r.get("code") == 0:
                        read_ok[0] += 1
                    else:
                        read_err[0] += 1
                        if diag_read[0] < 2:
                            diag_read[0] += 1
                            print(f"  [诊断] 读错误#{diag_read[0]}: code={r.get('code')} msg={str(r.get('message',''))[:100]}")
                    read_lats.append((time.perf_counter() - t0) * 1000)
            except Exception as e:
                with lock:
                    read_err[0] += 1
                    if diag_read[0] < 2:
                        diag_read[0] += 1
                        print(f"  [诊断] 读异常#{diag_read[0]}: {str(e)[:100]}")
                    read_lats.append((time.perf_counter() - t0) * 1000)

    def write_worker():
        while not stop.is_set():
            t0 = time.perf_counter()
            try:
                r, _ = http("POST", "/api/student-add", {"student": {
                    "name": f"mix_{random.randint(0,999999):06d}",
                    "phone": f"137{random.randint(0,9999999):07d}",
                    "grade": "一年级",
                }}, token=TOKEN, timeout=5)
                with lock:
                    if r.get("code") == 0:
                        write_ok[0] += 1
                    else:
                        write_err[0] += 1
                        if diag_write[0] < 2:
                            diag_write[0] += 1
                            print(f"  [诊断] 写错误#{diag_write[0]}: code={r.get('code')} msg={str(r.get('message',''))[:100]}")
                    write_lats.append((time.perf_counter() - t0) * 1000)
            except Exception as e:
                with lock:
                    write_err[0] += 1
                    if diag_write[0] < 2:
                        diag_write[0] += 1
                        print(f"  [诊断] 写异常#{diag_write[0]}: {str(e)[:100]}")
                    write_lats.append((time.perf_counter() - t0) * 1000)

    # 7 读线程 + 3 写线程
    threads = [threading.Thread(target=read_worker, daemon=True) for _ in range(7)]
    threads += [threading.Thread(target=write_worker, daemon=True) for _ in range(3)]
    for t in threads:
        t.start()

    start = time.perf_counter()
    while time.perf_counter() - start < duration_s:
        time.sleep(30)
        elapsed = time.perf_counter() - start
        with lock:
            r_snap = list(read_lats[-100:])
            w_snap = list(write_lats[-100:])
        rs = stats(r_snap)
        ws = stats(w_snap)
        r_er = error_rate(read_ok[0], read_err[0])
        w_er = error_rate(write_ok[0], write_err[0])
        print(f"  [{int(elapsed):3d}s] 读 P99={rs['p99_ms']:.2f}ms 错误率={r_er}%  |  写 P99={ws['p99_ms']:.2f}ms 错误率={w_er}%")

    stop.set()
    for t in threads:
        t.join(timeout=2)

    rs = stats(read_lats)
    ws = stats(write_lats)
    r_er = error_rate(read_ok[0], read_err[0])
    w_er = error_rate(write_ok[0], write_err[0])
    print(f"\n  汇总: 读 P99={rs['p99_ms']:.2f}ms 错误率={r_er}%  |  写 P99={ws['p99_ms']:.2f}ms 错误率={w_er}%")
    results = {"读P99": rs["p99_ms"], "读错误率": r_er, "写P99": ws["p99_ms"], "写错误率": w_er,
               "读QPS": round(len(read_lats)/duration_s, 1), "写QPS": round(len(write_lats)/duration_s, 1)}
    return results


def s5_audit_log_staircase():
    """S5 审计日志查询性能阶梯（审计表是最易膨胀的表，找查询变慢拐点）
    审计日志量随业务写入同步增长，每条写操作产生 1 条审计记录
    通过翻深页 + 大页 + 按模块过滤，找到审计表查询变慢的拐点
    """
    print("\n" + "=" * 60)
    print("  S5 审计日志查询性能阶梯（找审计表变慢拐点）")
    print(f"  SLA: P99 > {SLA_P99_MS}ms 判定不达标")
    print("  测什么：审计日志越积越多，翻到很后面会不会卡。找「开始卡」的页数。")
    print("=" * 60)
    results = []

    # 先获取当前审计日志总量
    r, _ = http("GET", "/api/audit-logs?page=1&pageSize=1", token=TOKEN)
    if r.get("code") != 0:
        # 请求失败：打印完整响应帮助诊断（常见原因：token 失效返回 401、权限不足返回 403）
        print(f"  [诊断] audit-logs 请求失败: code={r.get('code')} msg={r.get('message', '')}")
        print(f"  [诊断] 完整响应: {json.dumps(r, ensure_ascii=False)[:200]}")
        total = 0
    else:
        total = r.get("data", {}).get("total", 0)
    print(f"  当前审计日志总量: {total}")

    if total == 0:
        # 二次验证：total=0 可能是 MAX(rowid) 优化在空表返回 null 导致，也可能是真的无数据
        # 尝试拉一页数据看是否有 logs 字段
        r2, _ = http("GET", "/api/audit-logs?page=1&pageSize=5", token=TOKEN)
        if r2.get("code") == 0:
            logs = r2.get("data", {}).get("logs", [])
            if logs:
                print(f"  [诊断] total=0 但实际返回 {len(logs)} 条日志（MAX(rowid) 计数异常）")
                print(f"  [诊断] 首条: {json.dumps(logs[0], ensure_ascii=False)[:150]}")
                # 用实际返回条数作为 fallback
                total = max(1, len(logs))
            else:
                print("  [跳过] 无审计日志数据")
                return results
        else:
            print(f"  [跳过] audit-logs 二次验证失败: code={r2.get('code')} msg={r2.get('message', '')}")
            return results

    # 阶梯 1：首页 20 条
    print("\n  [阶梯 1] 首页 20 条")
    lats, ok, err = measure(lambda: http("GET", "/api/audit-logs?page=1&pageSize=20", token=TOKEN), 10)
    s = stats(lats)
    er = error_rate(ok, err)
    passed = s["p99_ms"] < SLA_P99_MS and er < SLA_ERROR_RATE * 100
    print(f"  P50={s['p50_ms']:.2f}ms  P99={s['p99_ms']:.2f}ms  错误率={er}%  {'✓' if passed else '✗'}")
    results.append({"阶梯": "首页20条", "P99": s["p99_ms"], "错误率": er, "达标": passed})

    # 阶梯 2：大页 100 条
    print("\n  [阶梯 2] 大页 100 条")
    lats, ok, err = measure(lambda: http("GET", "/api/audit-logs?page=1&pageSize=100", token=TOKEN), 10)
    s = stats(lats)
    er = error_rate(ok, err)
    passed = s["p99_ms"] < SLA_P99_MS and er < SLA_ERROR_RATE * 100
    print(f"  P50={s['p50_ms']:.2f}ms  P99={s['p99_ms']:.2f}ms  错误率={er}%  {'✓' if passed else '✗'}")
    results.append({"阶梯": "大页100条", "P99": s["p99_ms"], "错误率": er, "达标": passed})

    # 阶梯 3：深翻页（按总量估算合理的深页码）
    # 审计表深翻页会触发 LIMIT offset, pageSize，offset 越大越慢
    deep_pages = [10, 50, 100, 500, 1000]
    for page in deep_pages:
        # 跳过超出总量的页
        if page * 20 > total + 100:
            print(f"\n  [阶梯 深翻页第{page}页] 跳过（超出总量）")
            continue
        print(f"\n  [阶梯 深翻页第{page}页] offset={(page-1)*20}")
        lats, ok, err = measure(lambda: http("GET", f"/api/audit-logs?page={page}&pageSize=20", token=TOKEN), 10)
        s = stats(lats)
        er = error_rate(ok, err)
        passed = s["p99_ms"] < SLA_P99_MS and er < SLA_ERROR_RATE * 100
        print(f"  P50={s['p50_ms']:.2f}ms  P99={s['p99_ms']:.2f}ms  错误率={er}%  {'✓' if passed else '✗'}")
        results.append({"阶梯": f"深翻页第{page}页", "P99": s["p99_ms"], "错误率": er, "达标": passed})
        if not passed:
            print(f"\n  ⚠️  审计日志深翻页第 {page} 页时 P99 超过 {SLA_P99_MS}ms，审计表查询变慢")
            break

    # 阶梯 4：按模块过滤
    print("\n  [阶梯 按模块过滤 students]")
    lats, ok, err = measure(lambda: http("GET", "/api/audit-logs?module=students&page=1&pageSize=20", token=TOKEN), 10)
    s = stats(lats)
    er = error_rate(ok, err)
    passed = s["p99_ms"] < SLA_P99_MS and er < SLA_ERROR_RATE * 100
    print(f"  P50={s['p50_ms']:.2f}ms  P99={s['p99_ms']:.2f}ms  错误率={er}%  {'✓' if passed else '✗'}")
    results.append({"阶梯": "按模块students", "P99": s["p99_ms"], "错误率": er, "达标": passed})

    return results


def s6_attendance_stress(student_ids, course_id):
    """S6 点名压力测试（并发点名 + 大批量扣课）"""
    print("\n" + "=" * 60)
    print("  S6 点名压力测试（并发点名 + 大批量扣课）")
    print(f"  SLA: P99 > {SLA_P99_MS}ms 或 错误率 > {SLA_ERROR_RATE*100}% 判定不达标")
    print("  测什么：一次点名 50/100/200 个学员，还有多个老师同时点名，扛不扛得住。")
    print("=" * 60)
    results = []
    if not student_ids or not course_id:
        print("  [跳过] 缺数据")
        return results

    today = time.strftime("%Y-%m-%d")
    # 创建班级 + 报名 + 排课（前置条件）
    class_id = ensure_class("点名压测班", course_id)
    if not class_id:
        print("  [诊断] ensure_class 失败，无法创建班级")
        r, _ = http("GET", "/api/classes", token=TOKEN)
        if r.get("code") != 0:
            print(f"  [诊断] /api/classes 查询失败: code={r.get('code')} msg={r.get('message', '')}")
        print("  [跳过] 班级创建失败")
        return results
    sample = student_ids[:200]
    print(f"  准备：为 {len(sample)} 个学员创建报名+今日排课...")
    enr_ok = 0
    enr_fail = 0
    for sid in sample:
        if create_enrollment(sid, course_id, hours=20):
            enr_ok += 1
        else:
            enr_fail += 1
    print(f"  报名创建: 成功 {enr_ok} 失败 {enr_fail}")
    if enr_ok == 0 and sample:
        # 诊断首个报名失败原因
        r, _ = http("POST", "/api/enrollment-add", {"enrollment": {
            "studentId": sample[0], "courseId": course_id,
            "purchasedHours": 20, "giftHours": 2,
            "unitPrice": 100, "totalAmount": 2000, "paidAmount": 2000,
        }}, token=TOKEN)
        print(f"  [诊断] enrollment-add 响应: code={r.get('code')} msg={r.get('message', '')}")
    sched_pairs = []  # [(student_id, schedule_id), ...] —— 点名 API 需要 studentId
    sched_fail = 0
    for sid in sample:
        sid_sched = create_schedule(sid, course_id, class_id=class_id, date=today)
        if sid_sched:
            sched_pairs.append((sid, sid_sched))
        else:
            sched_fail += 1
    print(f"  已创建 {len(sched_pairs)} 条排课，失败 {sched_fail} 条")
    if not sched_pairs and sample:
        # 诊断首个排课失败原因
        r, _ = http("POST", "/api/schedule-add", {"schedule": {
            "studentId": sample[0], "courseId": course_id, "courseName": "性能测试课程",
            "classId": class_id, "studentName": f"perf_{sample[0][:8]}",
            "date": today, "startTime": "09:00", "endTime": "10:00",
        }}, token=TOKEN)
        print(f"  [诊断] schedule-add 响应: code={r.get('code')} msg={r.get('message', '')}")

    if not sched_pairs:
        print("  [跳过] 排课创建失败")
        return results

    # 构造点名 items：API 要求每项含 scheduleId + studentId + attended
    def make_items(pairs, attended=True):
        return [{"scheduleId": sid_sched, "studentId": sid, "attended": attended, "date": today}
                for sid, sid_sched in pairs]

    # 阶梯 1: 小批量点名（50条）
    items50 = make_items(sched_pairs[:50])
    lats, ok, err = measure(lambda: set_attendance(items50, date=today), 5)
    s = stats(lats)
    er = error_rate(ok, err)
    passed = s["p99_ms"] < SLA_P99_MS and er < SLA_ERROR_RATE * 100
    print(f"\n  [阶梯 1] 批量点名 50 条")
    print(f"  P50={s['p50_ms']:.2f}ms  P99={s['p99_ms']:.2f}ms  错误率={er}%  {'✓' if passed else '✗'}")
    results.append({"阶梯": "点名50条", "P99": s["p99_ms"], "错误率": er, "达标": passed})

    # 阶梯 2: 中批量点名（100条）
    items100 = make_items(sched_pairs[:100])
    lats, ok, err = measure(lambda: set_attendance(items100, date=today), 5)
    s = stats(lats)
    er = error_rate(ok, err)
    passed = s["p99_ms"] < SLA_P99_MS and er < SLA_ERROR_RATE * 100
    print(f"\n  [阶梯 2] 批量点名 100 条")
    print(f"  P50={s['p50_ms']:.2f}ms  P99={s['p99_ms']:.2f}ms  错误率={er}%  {'✓' if passed else '✗'}")
    results.append({"阶梯": "点名100条", "P99": s["p99_ms"], "错误率": er, "达标": passed})

    # 阶梯 3: 大批量点名（200条）
    items200 = make_items(sched_pairs[:200])
    lats, ok, err = measure(lambda: set_attendance(items200, date=today), 5)
    s = stats(lats)
    er = error_rate(ok, err)
    passed = s["p99_ms"] < SLA_P99_MS and er < SLA_ERROR_RATE * 100
    print(f"\n  [阶梯 3] 批量点名 200 条")
    print(f"  P50={s['p50_ms']:.2f}ms  P99={s['p99_ms']:.2f}ms  错误率={er}%  {'✓' if passed else '✗'}")
    results.append({"阶梯": "点名200条", "P99": s["p99_ms"], "错误率": er, "达标": passed})

    # 阶梯 4: 并发点名（10 个老师同时点名不同学员）
    chunks = [sched_pairs[i::10] for i in range(10)]
    concurrent_items = [make_items(chunk) for chunk in chunks if chunk]
    lats, ok, err, wall = measure_concurrent(
        lambda: set_attendance(concurrent_items[0], date=today) if concurrent_items else ({"code": -1}, 0),
        concurrency=len(concurrent_items), total=len(concurrent_items), timeout=120,
    )
    s = stats(lats)
    er = error_rate(ok, err)
    passed = s["p99_ms"] < SLA_P99_MS and er < SLA_ERROR_RATE * 100
    print(f"\n  [阶梯 4] 并发点名（{len(concurrent_items)} 路各 ~{len(concurrent_items[0]) if concurrent_items else 0} 条）")
    print(f"  P50={s['p50_ms']:.2f}ms  P99={s['p99_ms']:.2f}ms  错误率={er}%  {'✓' if passed else '✗'}")
    results.append({"阶梯": f"并发{len(concurrent_items)}路", "P99": s["p99_ms"], "错误率": er, "达标": passed})

    return results


# ============ 评估报告生成 ============

def generate_report(mode, results, duration_s):
    """生成 Markdown 评估报告（含通俗说明，方便非技术人员阅读）"""
    ts = time.strftime("%Y%m%d_%H%M%S")
    report_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reports")
    os.makedirs(report_dir, exist_ok=True)
    report_path = os.path.join(report_dir, f"perf_report_{ts}.md")

    # 判定测试环境类型
    if BASE.startswith("http://127.0.0.1") or BASE.startswith("http://localhost"):
        env_type = "本机"
    elif BASE.startswith("https://"):
        env_type = "公网"
    else:
        env_type = "局域网"

    lines = []
    lines.append(f"# 性能测试评估报告\n")
    lines.append(f"- **测试时间**：{time.strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"- **测试模式**：{'简易评估 (quick)' if mode == 'quick' else '压力测试 (stress)'}")
    lines.append(f"- **测试耗时**：{duration_s:.0f} 秒")
    lines.append(f"- **测试环境**：{env_type}")
    lines.append(f"- **服务地址**：{BASE}\n")
    lines.append(f"- **合格线（SLA）**：响应时间 P99 超过 {SLA_P99_MS}ms、或错误率超过 {SLA_ERROR_RATE*100}%，判定为「不达标」\n")
    if env_type != "本机":
        lines.append(f"> ⚠️ 非**本机**测试：网络延迟会叠加到所有响应时间上，结果反映的是「客户端→网络→服务端」端到端性能，而非纯服务端性能。\n")

    # ===== 指标说明（给非技术人员看） =====
    lines.append("## 📖 指标说明（看不懂术语请先读这里）\n")
    lines.append("| 术语 | 大白话解释 |")
    lines.append("|------|-----------|")
    lines.append("| **P50** | 一半的请求都在这个时间内完成，代表「正常速度」 |")
    lines.append("| **P95** | 95% 的请求都在这个时间内完成，代表「大部分人的体验」 |")
    lines.append("| **P99** | 99% 的请求都在这个时间内完成，剩下 1% 比这更慢。**重点看这个**，一高就说明有人卡住了 |")
    lines.append("| **QPS** | 每秒能处理多少个请求，数字越大越能扛 |")
    lines.append("| **错误率** | 100 个请求里失败几个，0% 最好，超过 1% 要警惕 |")
    lines.append("| **并发** | 同一时刻有多少人在用，比如「并发 100」= 100 人同时操作 |")
    lines.append("| **达标 ✓** | 这一关系统扛住了，正常 |")
    lines.append("| **不达标 ✗** | 这一关系统扛不住，需要关注 |")
    lines.append("| **衰减率** | 连续运行后会不会变慢。正数=变慢，负数=变快，绝对值越小越稳定 |")
    lines.append("")
    lines.append("> 经验值参考：P99 < 100ms 体感流畅；100-500ms 可接受；> 1000ms 用户会感觉卡顿。\n")

    # ===== 测试结果速读（先给结论） =====
    lines.append("## 🎯 测试结果速读（一句话结论）\n")
    quick_verdicts = _build_quick_verdicts(mode, results)
    for v in quick_verdicts:
        lines.append(f"- {v}")
    lines.append("")

    if mode == "quick":
        lines.append("## 简易评估结果（详细数据）\n")
        lines.append("固定 200+ 学员规模下的多维度性能快照。每个维度测一项常用操作。\n")
        for dim, data in results.items():
            lines.append(f"### {dim}\n")
            lines.append("| 指标 | 值 |")
            lines.append("|------|-----|")
            for k, v in data.items():
                if isinstance(v, float):
                    lines.append(f"| {k} | {v:.2f} |")
                else:
                    lines.append(f"| {k} | {v} |")
            lines.append("")
    else:
        # 压力测试报告
        lines.append("## 压力测试结果（详细数据）\n")

        # S1 数据量
        if "S1" in results:
            lines.append("### S1 数据量阶梯 —— 学员越多查询会不会变慢\n")
            lines.append("> 测什么：学员从 100 涨到 10000，看查询/搜索/报表/审计日志会不会变卡。找「开始卡」的学员数。\n")
            lines.append("| 学员规模 | 全量列表P99 | 模糊搜索P99 | 报表P99 | 审计P99 | 错误率 | 达标 |")
            lines.append("|----------|-------------|-------------|---------|---------|--------|------|")
            for r in results["S1"]:
                mark = "✓ 正常" if r["达标"] else "✗ 异常"
                audit_p99 = r.get("审计P99", 0)
                lines.append(f"| {r['规模']} | {r['全量列表P99']:.2f}ms | {r['模糊搜索P99']:.2f}ms | {r['报表P99']:.2f}ms | {audit_p99:.2f}ms | {r['错误率']}% | {mark} |")
            lines.append("")

        # S2 并发
        if "S2" in results:
            lines.append("### S2 并发阶梯 —— 同时多少人用会崩\n")
            lines.append("> 测什么：同时 10/50/100/200/500 人操作，看系统会不会出错或变慢。找「开始出错」的人数。\n")
            lines.append("| 并发人数 | 每秒处理(QPS) | P99响应 | 错误率 | 达标 |")
            lines.append("|----------|---------------|---------|--------|------|")
            for r in results["S2"]:
                mark = "✓ 正常" if r["达标"] else "✗ 异常"
                lines.append(f"| {r['并发']} | {r['QPS']:.1f} | {r['P99']:.2f}ms | {r['错误率']}% | {mark} |")
            lines.append("")

        # S3 持续负载
        if "S3" in results:
            s3 = results["S3"]
            lines.append("### S3 持续负载 —— 连续运行会不会越来越慢\n")
            lines.append("> 测什么：固定压力连续跑 3 分钟，看系统会不会越跑越慢（内存泄漏/卡顿）。\n")
            lines.append(f"- 起始 P99：{s3['首段P99']:.2f}ms")
            lines.append(f"- 结束 P99：{s3['末段P99']:.2f}ms")
            deg = s3['衰减率%']
            if deg > 50:
                deg_desc = f"衰减 {deg}%，**明显变慢**（疑似内存泄漏）"
            elif deg > 20:
                deg_desc = f"衰减 {deg}%，轻微变慢"
            else:
                deg_desc = f"衰减 {'+' if deg>0 else ''}{deg}%，**性能稳定**"
            lines.append(f"- 趋势：{deg_desc}\n")
            lines.append("| 运行时间(s) | QPS | P99 | 错误率 | 达标 |")
            lines.append("|-------------|-----|-----|--------|------|")
            for s in s3["samples"]:
                mark = "✓ 正常" if s["达标"] else "✗ 异常"
                lines.append(f"| {s['时间s']} | {s['QPS']:.1f} | {s['P99']:.2f}ms | {s['错误率']}% | {mark} |")
            lines.append("")

        # S4 混合负载
        if "S4" in results:
            s4 = results["S4"]
            lines.append("### S4 混合负载 —— 真实使用场景（7 成看、3 成写）\n")
            lines.append("> 测什么：模拟真实场景——大部分人查看、少部分人新增，看系统扛不扛得住混合操作。\n")
            lines.append(f"- 读操作：每秒 {s4['读QPS']:.1f} 次，P99={s4['读P99']:.2f}ms，错误率={s4['读错误率']}%")
            lines.append(f"- 写操作：每秒 {s4['写QPS']:.1f} 次，P99={s4['写P99']:.2f}ms，错误率={s4['写错误率']}%\n")

        # S5 审计日志
        if "S5" in results and results["S5"]:
            lines.append("### S5 审计日志查询 —— 日志多了会不会卡\n")
            lines.append("> 测什么：操作记录会越积越多，翻到很后面会不会变卡。找「开始卡」的页数。\n")
            lines.append("| 阶梯 | P99 | 错误率 | 达标 |")
            lines.append("|------|-----|--------|------|")
            for r in results["S5"]:
                mark = "✓ 正常" if r["达标"] else "✗ 异常"
                lines.append(f"| {r['阶梯']} | {r['P99']:.2f}ms | {r['错误率']}% | {mark} |")
            lines.append("")

        # S6 点名压力
        if "S6" in results and results["S6"]:
            lines.append("### S6 点名压力 —— 批量点名 + 多人同时点名\n")
            lines.append("> 测什么：一次点名 50/100/200 个学员，还有多个老师同时点名，看扣课快不快。\n")
            lines.append("| 阶梯 | P99 | 错误率 | 达标 |")
            lines.append("|------|-----|--------|------|")
            for r in results["S6"]:
                mark = "✓ 正常" if r["达标"] else "✗ 异常"
                lines.append(f"| {r['阶梯']} | {r['P99']:.2f}ms | {r['错误率']}% | {mark} |")
            lines.append("")

        # ===== 综合评估（大白话） =====
        lines.append("## 📋 综合评估（详细解读）\n")
        verdicts = _build_detailed_verdicts(results)
        for v in verdicts:
            lines.append(f"- {v}")
        lines.append("")

    content = "\n".join(lines)
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"\n  📄 评估报告已生成：{os.path.abspath(report_path)}")
    return report_path


def _build_quick_verdicts(mode, results):
    """生成「测试结果速读」——一句话结论，用大白话告诉用户系统好不好用"""
    verdicts = []
    if mode == "quick":
        # 简易评估：看几个关键指标
        verdicts.append(f"✅ 测试已完成，耗时 {int(results.get('_duration', 0))} 秒" if False else "✅ 简易评估已完成")
        # 检查是否有明显异常的指标
        issues = []
        for dim, data in results.items():
            if not isinstance(data, dict):
                continue
            for k, v in data.items():
                if not isinstance(v, (int, float)):
                    continue
                if "P99" in k and v > SLA_P99_MS:
                    issues.append(f"{dim} 的 {k}={v:.0f}ms 超过 1 秒")
                elif "错误率" in k and v > SLA_ERROR_RATE * 100:
                    issues.append(f"{dim} 的 {k}={v}% 超过 1%")
                elif "CPU" in k and v > SLA_CPU_PERCENT:
                    issues.append(f"{dim} 的 {k}={v}% 超过 80%")
        if issues:
            verdicts.append("⚠️ 发现以下问题需关注：")
            for i in issues[:5]:
                verdicts.append(f"   - {i}")
        else:
            verdicts.append("✅ 各项指标均在正常范围内，系统运行良好。")
    else:
        # 压力测试：汇总各阶梯结论
        verdicts.append(f"✅ 压力测试已完成")
        all_pass = True
        # S1 数据量
        if "S1" in results:
            failed = [r for r in results["S1"] if not r["达标"]]
            if failed:
                all_pass = False
                verdicts.append(f"⚠️ **数据量**：学员达到 {failed[0]['规模']} 时查询开始变慢（P99 超过 1 秒）")
            else:
                verdicts.append(f"✅ **数据量**：学员达到 {results['S1'][-1]['规模']} 人查询仍流畅")
        # S2 并发
        if "S2" in results:
            failed = [r for r in results["S2"] if not r["达标"]]
            if failed:
                all_pass = False
                verdicts.append(f"⚠️ **并发**：同时 {failed[0]['并发']} 人时系统开始出错或变慢")
            else:
                verdicts.append(f"✅ **并发**：同时 {results['S2'][-1]['并发']} 人系统仍稳定")
        # S3 持续负载
        if "S3" in results:
            deg = results["S3"]["衰减率%"]
            if deg > 50:
                all_pass = False
                verdicts.append(f"⚠️ **稳定性**：连续运行后性能衰减 {deg}%，明显变慢（疑似内存泄漏）")
            elif deg > 20:
                verdicts.append(f"⚠️ **稳定性**：连续运行后性能衰减 {deg}%，轻微变慢")
            else:
                verdicts.append(f"✅ **稳定性**：连续运行 3 分钟性能稳定（衰减 {'+' if deg>0 else ''}{deg}%）")
        # S4 混合负载
        if "S4" in results:
            s4 = results["S4"]
            if s4["写错误率"] > SLA_ERROR_RATE * 100 or s4["读错误率"] > SLA_ERROR_RATE * 100:
                all_pass = False
                verdicts.append(f"⚠️ **混合负载**：写错误率 {s4['写错误率']}%、读错误率 {s4['读错误率']}%，超标")
            else:
                verdicts.append(f"✅ **混合负载**：读写混合场景正常（读 {s4['读QPS']:.0f}/秒，写 {s4['写QPS']:.0f}/秒）")
        # S5 审计日志
        if "S5" in results and results["S5"]:
            failed = [r for r in results["S5"] if not r["达标"]]
            if failed:
                all_pass = False
                verdicts.append(f"⚠️ **审计日志**：{failed[0]['阶梯']} 时查询变慢（建议按月归档旧日志）")
            else:
                verdicts.append(f"✅ **审计日志**：所有翻页查询均流畅")
        # S6 点名
        if "S6" in results and results["S6"]:
            failed = [r for r in results["S6"] if not r["达标"]]
            if failed:
                all_pass = False
                verdicts.append(f"⚠️ **点名**：{failed[0]['阶梯']} 时点名变慢或出错")
            else:
                verdicts.append(f"✅ **点名**：批量点名和并发点名均正常")
        # 总结论
        if all_pass:
            verdicts.append("\n🎉 **总结**：系统在所有测试场景下均表现良好，可以放心使用。")
        else:
            verdicts.append("\n📋 **总结**：部分场景需要关注，详见下方「综合评估」的逐项解读。")
    return verdicts


def _build_detailed_verdicts(results):
    """生成「综合评估」详细解读，用大白话逐项解释"""
    verdicts = []
    # S1 数据量
    if "S1" in results:
        failed = [r for r in results["S1"] if not r["达标"]]
        if failed:
            verdicts.append(f"**📈 数据量边界**：当学员数达到 **{failed[0]['规模']}** 时，查询响应时间 P99 超过 1 秒，开始变卡。建议控制学员规模，或对慢查询做索引优化。")
        else:
            verdicts.append(f"**📈 数据量边界**：学员规模到 **{results['S1'][-1]['规模']}** 人查询仍流畅（P99 < 1 秒），未找到瓶颈，可放心扩招。")
    # S5 审计日志
    if "S5" in results and results["S5"]:
        failed = [r for r in results["S5"] if not r["达标"]]
        if failed:
            verdicts.append(f"**📝 审计日志边界**：在 **{failed[0]['阶梯']}** 时查询变慢。审计日志会随操作不断累积，建议定期按月归档旧日志，保持查询速度。")
        else:
            verdicts.append(f"**📝 审计日志边界**：所有翻页查询均流畅，审计日志查询性能良好。")
    # S2 并发
    if "S2" in results:
        failed = [r for r in results["S2"] if not r["达标"]]
        if failed:
            verdicts.append(f"**👥 并发边界**：同时 **{failed[0]['并发']}** 人操作时，错误率或响应时间超标，系统开始不稳定。教培场景同时在线人数通常不会超过这个值，可酌情忽略或扩容。")
        else:
            verdicts.append(f"**👥 并发边界**：同时 **{results['S2'][-1]['并发']}** 人操作系统仍稳定，未找到崩溃点，并发能力充足。")
    # S3 持续负载
    if "S3" in results:
        deg = results["S3"]["衰减率%"]
        if deg > 50:
            verdicts.append(f"**⏱️ 稳定性**：连续运行 3 分钟后，响应时间增加了 **{deg}%**，存在明显性能衰减。可能原因：内存泄漏、WAL 文件膨胀。建议重启服务观察，或检查是否有未释放的资源。")
        elif deg > 20:
            verdicts.append(f"**⏱️ 稳定性**：连续运行后性能衰减 {deg}%，有轻微变慢，建议持续观察。")
        else:
            verdicts.append(f"**⏱️ 稳定性**：连续运行 3 分钟性能稳定（衰减 {'+' if deg>0 else ''}{deg}%），无内存泄漏迹象。")
    # S4 混合负载
    if "S4" in results:
        s4 = results["S4"]
        if s4["写错误率"] > SLA_ERROR_RATE * 100:
            verdicts.append(f"**🔀 混合负载**：写操作错误率 {s4['写错误率']}% 超标。SQLite 数据库同一时刻只允许一个写操作，高并发写入时会排队失败。如果业务有大量并发写入需求，可考虑换用 PostgreSQL/MySQL。")
        else:
            verdicts.append(f"**🔀 混合负载**：读写混合场景正常，读 {s4['读QPS']:.0f} 次/秒、写 {s4['写QPS']:.0f} 次/秒，满足日常使用。")
    # S6 点名
    if "S6" in results and results["S6"]:
        failed = [r for r in results["S6"] if not r["达标"]]
        if failed:
            verdicts.append(f"**✋ 点名边界**：{failed[0]['阶梯']} 时点名变慢或出错。点名是高频操作，建议优化批量扣课逻辑或分批点名。")
        else:
            verdicts.append(f"**✋ 点名边界**：批量点名（最多 200 条）和多人同时点名均正常，点名性能良好。")
    return verdicts


# ============ 主流程 ============

def run_quick():
    """简易评估：D1-D9"""
    print("=" * 60)
    print("  排课系统简易性能评估 (quick)")
    print("  时间: " + time.strftime("%Y-%m-%d %H:%M:%S"))
    print("=" * 60)

    login()
    ensure_grade("一年级")
    course_id = ensure_course("性能测试课程")

    # 补齐 200 学员
    existing = get_perf_students()
    print(f"[准备] 现有 perf_ 学员: {len(existing)}")
    if len(existing) < 200:
        need = 200 - len(existing)
        print(f"[准备] 补充 {need} 个学员...")
        new_ids = create_students(need)
        for sid in new_ids:
            create_enrollment(sid, course_id, hours=20)

    student_ids = [s["id"] for s in get_perf_students()]
    print(f"[准备] 测试学员: {len(student_ids)}")

    start = time.perf_counter()
    all_results = {}
    all_results["D1基础延迟"] = d1_basic_latency()
    all_results["D2并发吞吐"] = d2_concurrency()
    all_results["D3DB查询"] = d3_db_query(student_ids)
    all_results["D4业务事务"] = d4_business_tx(student_ids, course_id)
    all_results["D5报表聚合"] = d5_reports()
    all_results["D6搜索性能"] = d6_search(student_ids)
    all_results["D7鉴权性能"] = d7_auth()
    all_results["D8写吞吐"] = d8_write_throughput(course_id)
    all_results["D9系统资源"] = d9_system()
    all_results["D10课程班级"] = d10_courses_classes(student_ids, course_id)
    all_results["D11审计日志"] = d11_audit_logs()
    all_results["D12反馈绩效"] = d12_feedback_perf(student_ids, course_id)
    all_results["D13点名性能"] = d13_attendance(student_ids, course_id)
    all_results["D14排课写入"] = d14_schedule_write(student_ids, course_id)
    all_results["D15退课性能"] = d15_transfer(student_ids, course_id)
    all_results["D16优化表查询"] = d16_optimized_tables(student_ids)
    duration = time.perf_counter() - start

    report_path = generate_report("quick", all_results, duration)
    print("\n" + "=" * 60)
    print("  简易评估完成")
    print("=" * 60)
    return report_path


def run_stress():
    """压力测试：S1-S4 + 评估报告"""
    print("=" * 60)
    print("  排课系统压力测试 (stress)")
    print("  时间: " + time.strftime("%Y-%m-%d %H:%M:%S"))
    print(f"  SLA: P99 > {SLA_P99_MS}ms 或 错误率 > {SLA_ERROR_RATE*100}% 判定不达标")
    print("  ⚠️  本测试会创建大量测试数据，建议在测试环境运行")
    print("=" * 60)

    login()
    ensure_grade("一年级")
    course_id = ensure_course("性能测试课程")

    # 预热：确保至少 100 学员
    existing = get_perf_students()
    if len(existing) < 100:
        create_students(100 - len(existing))
    student_ids = [s["id"] for s in get_perf_students()]
    print(f"[准备] 初始学员: {len(student_ids)}")

    start = time.perf_counter()
    all_results = {}
    print("\n>>> S1 数据量阶梯测试 <<<")
    all_results["S1"] = s1_data_volume_staircase(course_id)

    # 刷新学员列表（S1 可能新增了大量学员）
    student_ids = [s["id"] for s in get_perf_students()]

    print("\n>>> S2 并发阶梯测试 <<<")
    all_results["S2"] = s2_concurrency_staircase()

    print("\n>>> S3 持续负载测试 <<<")
    all_results["S3"] = s3_sustained_load(duration_s=180)

    print("\n>>> S4 混合负载测试 <<<")
    all_results["S4"] = s4_mixed_load(student_ids, course_id, duration_s=120)

    print("\n>>> S5 审计日志查询阶梯 <<<")
    all_results["S5"] = s5_audit_log_staircase()

    print("\n>>> S6 点名压力测试 <<<")
    all_results["S6"] = s6_attendance_stress(student_ids, course_id)

    duration = time.perf_counter() - start
    report_path = generate_report("stress", all_results, duration)

    print("\n" + "=" * 60)
    print("  压力测试完成")
    print("=" * 60)
    return report_path


def parse_target(args):
    """解析测试目标地址，返回最终 BASE URL。
    优先级：--base > --wan > --lan > --local > PERF_BASE 环境变量 > 默认本机
    """
    global BASE
    if args.base:
        BASE = args.base.rstrip("/")
    elif args.wan:
        BASE = args.wan.rstrip("/")
    elif args.lan:
        # 局域网：传 IP 或 host，默认 8788 端口、http
        host = args.lan
        if host.startswith("http://") or host.startswith("https://"):
            BASE = host.rstrip("/")
        else:
            port = args.lan_port or 8788
            BASE = f"http://{host}:{port}"
    elif args.local:
        BASE = "http://127.0.0.1:8788"
    # else: 保持环境变量或默认值
    return BASE


def main():
    parser = argparse.ArgumentParser(
        description="排课系统性能测试脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  %(prog)s quick --local                       本机测试
  %(prog)s stress --lan 192.168.1.100          局域网测试（默认端口 8788）
  %(prog)s quick --lan 192.168.1.100 --lan-port 9000  指定局域网端口
  %(prog)s stress --wan https://api.example.com       公网测试
  %(prog)s quick --base http://10.0.0.5:9000          自定义地址

环境变量:
  PERF_BASE    默认测试目标（如 http://192.168.1.100:8788）
""",
    )
    parser.add_argument("mode", nargs="?", choices=["quick", "stress"], help="测试模式：quick 或 stress")
    target_group = parser.add_argument_group("测试目标（互斥，按优先级：--base > --wan > --lan > --local）")
    target_group.add_argument("--local", action="store_true", help="本机 127.0.0.1:8788")
    target_group.add_argument("--lan", metavar="HOST", help="局域网地址（IP 或 host，默认端口 8788）")
    target_group.add_argument("--lan-port", type=int, default=None, help="局域网端口（默认 8788，需配合 --lan）")
    target_group.add_argument("--wan", metavar="URL", help="公网地址（完整 URL，含 http/https）")
    target_group.add_argument("--base", metavar="URL", help="自定义完整地址（含 http/https 和端口）")

    auth_group = parser.add_argument_group("登录账号（默认 admin/admin123，也可用环境变量 PERF_USER/PERF_PASS）")
    auth_group.add_argument("--user", metavar="USERNAME", help="登录账号（默认 admin）")
    auth_group.add_argument("--password", metavar="PASSWORD", help="登录密码（默认 admin123）")

    args = parser.parse_args()
    interactive = False  # 标记是否经过交互式选择

    # 交互式选择模式
    if not args.mode:
        print("请选择测试模式：")
        print("  1. quick  - 简易评估（约 4 分钟，固定规模性能快照）")
        print("  2. stress - 压力测试（约 20 分钟，SLA 阶梯找边界）")
        choice = input("\n输入 1 或 2: ").strip()
        args.mode = "quick" if choice == "1" else "stress"
        interactive = True

    # 交互式选择目标环境（未显式指定时）
    if not (args.local or args.lan or args.wan or args.base):
        print("\n请选择测试目标环境：")
        print("  1. 本机    - 127.0.0.1:8788")
        print("  2. 局域网  - 输入 IP 或 host（默认端口 8788）")
        print("  3. 公网    - 输入完整 URL（含 http/https）")
        print("  4. 自定义  - 输入完整地址（含 http/https 和端口）")
        env_choice = input("\n输入 1/2/3/4: ").strip()
        interactive = True
        if env_choice == "1":
            args.local = True
        elif env_choice == "2":
            host = input("  局域网地址（IP 或 host）: ").strip()
            if not host:
                print("地址不能为空")
                sys.exit(1)
            port_input = input(f"  端口（回车默认 8788）: ").strip()
            args.lan = host
            if port_input:
                try:
                    args.lan_port = int(port_input)
                except ValueError:
                    print(f"非法端口: {port_input}")
                    sys.exit(1)
        elif env_choice == "3":
            url = input("  公网地址（完整 URL，如 https://api.example.com）: ").strip()
            if not url:
                print("地址不能为空")
                sys.exit(1)
            args.wan = url
        elif env_choice == "4":
            url = input("  自定义地址（完整 URL，如 http://10.0.0.5:9000）: ").strip()
            if not url:
                print("地址不能为空")
                sys.exit(1)
            args.base = url
        else:
            print(f"未知选项: {env_choice}，默认使用本机")
            args.local = True

    # 解析目标地址
    parse_target(args)

    # 解析登录账号：命令行参数 > 环境变量 > 默认 admin/admin123
    global ADMIN_USER, ADMIN_PASS
    if args.user:
        ADMIN_USER = args.user
    if args.password:
        ADMIN_PASS = args.password

    print("=" * 60)
    print(f"  测试目标: {BASE}")
    print(f"  测试模式: {args.mode}")
    print(f"  登录账号: {ADMIN_USER}")
    print("=" * 60)

    # 用 try/finally 包裹整个测试逻辑，确保交互式模式下无论成功/异常/中断都会等待用户确认
    # 解决 Windows 双击 .py 运行时窗口直接关闭的问题
    try:
        # 测试前连通性检查
        print("[连通性检查] 正在测试目标是否可达...")
        t0 = time.perf_counter()
        r, status = http("GET", "/api/config", timeout=5)
        latency = (time.perf_counter() - t0) * 1000
        if status == 0:
            print(f"  ✗ 目标不可达: {r.get('message', '未知错误')}")
            print("  请检查地址是否正确、服务是否启动、防火墙是否放行")
            sys.exit(1)
        print(f"  ✓ 目标可达，配置接口延迟 {latency:.0f}ms\n")

        # 交互式模式下，登录失败时让用户重新输入账号密码（最多 3 次）
        login_attempted = False
        while True:
            try:
                if interactive and login_attempted:
                    # 上次登录失败，让用户输入账号密码
                    ADMIN_USER = input("  登录账号: ").strip()
                    ADMIN_PASS = input("  登录密码: ").strip()
                login()
                break
            except Exception as login_err:
                login_attempted = True
                if not interactive:
                    # 命令行模式：直接抛出，不交互
                    raise
                print(f"  ✗ {login_err}")
                # 检查是否未初始化（data.bootstrap=true 表示需要引导，即未初始化）
                # 未初始化时自动用 admin/admin123 引导，然后重试登录
                try:
                    bs, _ = http("GET", "/api/auth/bootstrap", timeout=5)
                    if bs.get("code") == 0 and bs.get("data", {}).get("bootstrap"):
                        print("  ℹ 系统尚未初始化，自动用 admin/admin123 初始化...")
                        r, status = http("POST", "/api/auth/bootstrap", {
                            "username": "admin",
                            "password": "admin123",
                            "realName": "管理员",
                        }, timeout=10)
                        if r.get("code") == 0:
                            print("  ✓ 初始化成功（账号 admin / 密码 admin123）")
                            ADMIN_USER = "admin"
                            ADMIN_PASS = "admin123"
                            login_attempted = False  # 重置标记，直接用默认账号重试登录
                        else:
                            print(f"  ✗ 初始化失败: {r.get('message', '未知错误')}")
                            sys.exit(1)
                except Exception:
                    pass

        if args.mode == "quick":
            run_quick()
        elif args.mode == "stress":
            run_stress()
    except SystemExit:
        # sys.exit 触发，交互式模式下仍需等待
        raise
    except Exception as e:
        print(f"\n[错误] 测试过程中发生异常: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # 交互式运行时（经过 input 选择），无论成功/异常都等待用户确认后再退出
        # 管道/重定向调用时 input 收到 EOF 触发异常，被捕获后正常退出，不会卡住
        if interactive:
            try:
                input("\n按回车键退出...")
            except (EOFError, KeyboardInterrupt):
                pass


if __name__ == "__main__":
    main()
