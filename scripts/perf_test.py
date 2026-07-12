#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
排课系统多维度性能测试脚本

覆盖维度：
  D1 基础响应延迟（冷/热、公开/鉴权 API）
  D2 并发吞吐量（不同并发数 QPS + P50/P95/P99）
  D3 数据库查询性能（按数据量级）
  D4 业务事务性能（点名、报名、退课）
  D5 报表聚合性能（6 种报表）
  D6 搜索性能（学员搜索、排课搜索）
  D7 鉴权性能（token 校验、requirePermission 查库）
  D8 稳定性（长时运行 + 内存占用）
"""

import json
import time
import statistics
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlencode
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:8788"
TOKEN = None
ADMIN_ID = None

# ============ HTTP 工具 ============

def http(method, path, body=None, token=None, timeout=30):
    url = BASE + path
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw), resp.status
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            return json.loads(raw), e.code
        except Exception:
            return {"code": -1, "message": raw}, e.code
    except Exception as e:
        return {"code": -1, "message": str(e)}, 0


def measure(fn, n=1):
    """执行 n 次 fn，返回 (latencies_ms, success_count)"""
    lats = []
    ok = 0
    for _ in range(n):
        t0 = time.perf_counter()
        try:
            r, _ = fn()
            if isinstance(r, dict) and r.get("code") == 0:
                ok += 1
        except Exception:
            pass
        lats.append((time.perf_counter() - t0) * 1000)
    return lats, ok


def measure_concurrent(fn, concurrency=10, total=100):
    """并发执行 total 次请求，concurrency 并发数，返回 (latencies_ms, success_count, wall_s)"""
    lats = []
    ok = 0
    lock = threading.Lock()
    wall0 = time.perf_counter()

    def worker():
        nonlocal ok
        t0 = time.perf_counter()
        try:
            r, _ = fn()
            if isinstance(r, dict) and r.get("code") == 0:
                with lock:
                    ok += 1
        except Exception:
            pass
        with lock:
            lats.append((time.perf_counter() - t0) * 1000)

    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = [pool.submit(worker) for _ in range(total)]
        for f in as_completed(futures):
            f.result()
    wall = time.perf_counter() - wall0
    return lats, ok, wall


def stats(lats):
    """计算延迟统计"""
    if not lats:
        return {"count": 0}
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


# ============ 测试数据准备 ============

def login():
    global TOKEN, ADMIN_ID
    r, _ = http("POST", "/api/auth", {"username": "admin", "password": "admin123"})
    if r.get("code") != 0:
        raise Exception("登录失败: " + r.get("message", ""))
    TOKEN = r["data"]["token"]
    ADMIN_ID = r["data"]["admin"]["id"]
    print(f"[登录] 成功 token={TOKEN[:20]}... admin={ADMIN_ID}")


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


def create_schedules(student_id, course_id, dates):
    """为学员在指定日期列表创建排课"""
    for d in dates:
        http("POST", "/api/schedule-add", {"schedule": {
            "studentId": student_id,
            "studentName": f"perf_{student_id[-5:]}",
            "courseId": course_id,
            "courseName": "性能测试课程",
            "date": d,
            "startTime": "09:00",
            "endTime": "10:00",
        }}, token=TOKEN)


# ============ D1 基础响应延迟 ============

def d1_basic_latency():
    print("\n" + "=" * 60)
    print("  D1 基础响应延迟（冷/热、公开/鉴权）")
    print("=" * 60)

    # 冷请求（首次）
    lats_cold, _ = measure(lambda: http("GET", "/api/config"), 1)

    # 热请求（已缓存）
    lats_hot, _ = measure(lambda: http("GET", "/api/config"), 100)

    # 公告（单行表，极简）
    lats_ann, _ = measure(lambda: http("GET", "/api/announcement"), 100)

    # 鉴权 API（token 校验 + 查库）
    lats_auth, _ = measure(lambda: http("GET", "/api/auth", token=TOKEN), 100)

    # 学员列表
    lats_students, _ = measure(lambda: http("GET", "/api/students", token=TOKEN), 50)

    print(f"  配置接口(冷)    {stats(lats_cold)['avg_ms']} ms")
    print(f"  配置接口(热)    {stats(lats_hot)}")
    print(f"  公告接口        {stats(lats_ann)}")
    print(f"  鉴权校验(/auth) {stats(lats_auth)}")
    print(f"  学员列表        {stats(lats_students)}")


# ============ D2 并发吞吐量 ============

def d2_concurrency():
    print("\n" + "=" * 60)
    print("  D2 并发吞吐量（不同并发数）")
    print("=" * 60)

    results = []
    for conc in [1, 5, 10, 20, 50]:
        lats, ok, wall = measure_concurrent(
            lambda: http("GET", "/api/config"),
            concurrency=conc, total=200,
        )
        s = stats(lats)
        q = qps(lats, wall)
        results.append((conc, s, q, ok))
        print(f"  并发={conc:3d}  QPS={q:6.1f}  P50={s['p50_ms']:6.2f}ms  P95={s['p95_ms']:6.2f}ms  P99={s['p99_ms']:6.2f}ms  成功率={ok}/200")

    print("\n  --- 鉴权接口并发（含 token 校验 + DB 查询） ---")
    for conc in [1, 10, 20]:
        lats, ok, wall = measure_concurrent(
            lambda: http("GET", "/api/auth", token=TOKEN),
            concurrency=conc, total=100,
        )
        s = stats(lats)
        q = qps(lats, wall)
        print(f"  并发={conc:3d}  QPS={q:6.1f}  P50={s['p50_ms']:6.2f}ms  P95={s['p95_ms']:6.2f}ms  成功率={ok}/100")


# ============ D3 数据库查询性能 ============

def d3_db_query(student_ids):
    print("\n" + "=" * 60)
    print("  D3 数据库查询性能（按学员查排课）")
    print("=" * 60)

    if not student_ids:
        print("  [跳过] 无学员数据")
        return

    # 按 ID 查（索引命中）
    for sid in student_ids[:3]:
        lats, _ = measure(lambda: http("GET", f"/api/schedules?studentId={sid}"), 50)
        print(f"  单学员排课  {stats(lats)}")

    # 并发按 ID 查
    import random
    lats, ok, wall = measure_concurrent(
        lambda: http("GET", f"/api/schedules?studentId={random.choice(student_ids)}"),
        concurrency=20, total=200,
    )
    s = stats(lats)
    print(f"  并发20查排课  QPS={qps(lats, wall):.1f}  {s}")


# ============ D4 业务事务性能 ============

def d4_business_tx(student_ids, course_id):
    print("\n" + "=" * 60)
    print("  D4 业务事务性能（报名/点名/退课）")
    print("=" * 60)

    if not student_ids or not course_id:
        print("  [跳过] 缺数据")
        return

    # 报名创建（单条）
    sample = student_ids[:20]
    lats = []
    for sid in sample:
        t0 = time.perf_counter()
        create_enrollment(sid, course_id, hours=20)
        lats.append((time.perf_counter() - t0) * 1000)
    print(f"  创建报名(单条)  {stats(lats)}")

    # 排课 + 点名（批量点名事务）
    # 先为前 10 个学员各排一节课
    today = time.strftime("%Y-%m-%d")
    sched_ids = []
    for sid in sample[:10]:
        r, _ = http("POST", "/api/schedule-add", {"schedule": {
            "studentId": sid,
            "studentName": "perf_test",
            "courseId": course_id,
            "courseName": "性能测试课程",
            "date": today,
            "startTime": "14:00",
            "endTime": "15:00",
        }}, token=TOKEN)
        if r.get("code") == 0:
            sched_ids.append((sid, r["data"]["schedule"]["id"]))

    if sched_ids:
        # 批量点名到课
        attendance_items = [{"studentId": sid, "scheduleId": scid, "date": today, "attended": True} for sid, scid in sched_ids]
        lats, _ = measure(lambda: http("POST", "/api/attendance", {"items": attendance_items}, token=TOKEN), 10)
        print(f"  批量点名(10条)  {stats(lats)}")

    # 退课结转（事务最复杂：清零+余额+取消排课）
    lats = []
    for sid in sample[:5]:
        # 查报名
        r, _ = http("GET", f"/api/enrollments?studentId={sid}", token=TOKEN)
        if r.get("code") != 0:
            continue
        enrs = r["data"].get("enrollments", [])
        active = [e for e in enrs if e.get("status") == "active" and e.get("remainingPaidHours", 0) > 0]
        if not active:
            continue
        eid = active[0]["id"]
        t0 = time.perf_counter()
        http("POST", "/api/transfer-add", {
            "studentId": sid,
            "fromEnrollmentId": eid,
            "giftMode": "discard",
            "reason": "性能测试",
        }, token=TOKEN)
        lats.append((time.perf_counter() - t0) * 1000)
    if lats:
        print(f"  退课结转(事务)  {stats(lats)}")


# ============ D5 报表聚合性能 ============

def d5_reports():
    print("\n" + "=" * 60)
    print("  D5 报表聚合性能（6 种报表）")
    print("=" * 60)

    today = time.strftime("%Y-%m-%d")
    month_start = today[:8] + "01"
    report_types = [
        ("revenue", "营收报表", {"startDate": month_start, "endDate": today}),
        ("hours-consumption", "课时消耗", {"startDate": month_start, "endDate": today}),
        ("hours-balance", "课时余额", {}),
        ("attendance-rate", "出勤率", {"startDate": month_start, "endDate": today}),
        ("transfers", "结转统计", {"startDate": month_start, "endDate": today}),
        ("enrollment-stats", "报名统计", {"startDate": month_start, "endDate": today}),
    ]

    for rtype, label, extra in report_types:
        params = {"type": rtype, **extra}
        qs = urlencode(params)
        lats, ok = measure(lambda: http("GET", f"/api/reports?{qs}", token=TOKEN), 10)
        s = stats(lats)
        print(f"  {label:8s}  {s}  成功={ok}/10")


# ============ D6 搜索性能 ============

def d6_search(student_ids):
    print("\n" + "=" * 60)
    print("  D6 搜索性能（学员搜索、排课搜索）")
    print("=" * 60)

    if not student_ids:
        print("  [跳过] 无数据")
        return

    # 精确匹配（命中）
    lats, _ = measure(lambda: http("GET", f"/api/students?q=perf_00000"), 50)
    print(f"  精确搜索      {stats(lats)}")

    # 模糊匹配（前缀）
    lats, _ = measure(lambda: http("GET", "/api/students?q=perf_0"), 50)
    print(f"  模糊前缀搜索  {stats(lats)}")

    # 空查询（全量）
    lats, _ = measure(lambda: http("GET", "/api/students?q="), 20)
    print(f"  全量学员列表  {stats(lats)}")

    # 排课搜索（跨学员）
    today = time.strftime("%Y-%m-%d")
    month_start = today[:8] + "01"
    lats, _ = measure(
        lambda: http("GET", f"/api/schedules-search?startDate={month_start}&endDate={today}", token=TOKEN),
        20,
    )
    print(f"  排课搜索      {stats(lats)}")


# ============ D7 鉴权性能 ============

def d7_auth():
    print("\n" + "=" * 60)
    print("  D7 鉴权性能（token 校验 + requirePermission 查库）")
    print("=" * 60)

    # 鉴权接口（每次查库取最新角色）
    lats, _ = measure(lambda: http("GET", "/api/auth", token=TOKEN), 200)
    print(f"  /api/auth(查库)  {stats(lats)}")

    # 权限定义接口（纯内存返回）
    lats, _ = measure(lambda: http("GET", "/api/permission-definitions", token=TOKEN), 100)
    print(f"  权限定义(内存)  {stats(lats)}")

    # 并发鉴权
    lats, ok, wall = measure_concurrent(
        lambda: http("GET", "/api/auth", token=TOKEN),
        concurrency=20, total=200,
    )
    s = stats(lats)
    print(f"  并发20鉴权      QPS={qps(lats, wall):.1f}  {s}")

    # 错误 token 拒绝速度
    lats, _ = measure(lambda: http("GET", "/api/auth", token="invalid.token.here"), 50)
    print(f"  错误token拒绝   {stats(lats)}")


# ============ D8 写操作吞吐 ============

def d8_write_throughput(course_id):
    print("\n" + "=" * 60)
    print("  D8 写操作吞吐量（新增学员/排课）")
    print("=" * 60)

    # 串行新增学员
    lats = []
    for i in range(50):
        t0 = time.perf_counter()
        http("POST", "/api/student-add", {"student": {
            "name": f"write_{i:04d}",
            "phone": f"139{i:07d}",
            "grade": "一年级",
        }}, token=TOKEN)
        lats.append((time.perf_counter() - t0) * 1000)
    s = stats(lats)
    print(f"  串行新增学员(50)  {s}  吞吐={qps(lats, sum(lats)/1000):.1f} ops/s")

    # 并发新增学员
    import random
    lats, ok, wall = measure_concurrent(
        lambda: http("POST", "/api/student-add", {"student": {"name": f"conc_{random.randint(0,99999):05d}", "phone": f"137{random.randint(0,9999999):07d}", "grade": "一年级"}}, token=TOKEN),
        concurrency=10, total=100,
    )
    s = stats(lats)
    print(f"  并发10新增(100)   QPS={qps(lats, wall):.1f}  {s}  成功={ok}/100")


# ============ D9 内存与进程 ============

def d9_system():
    print("\n" + "=" * 60)
    print("  D9 系统资源占用")
    print("=" * 60)

    import os
    import subprocess

    # 找 node 进程
    try:
        result = subprocess.run(["ps", "aux"], capture_output=True, text=True, timeout=5)
        for line in result.stdout.split("\n"):
            if "node server" in line and "grep" not in line:
                parts = line.split()
                if len(parts) >= 6:
                    cpu = parts[2]
                    mem = parts[3]
                    rss = parts[5] if len(parts) > 5 else "?"
                    print(f"  node 进程  CPU={cpu}%  MEM={mem}%  RSS={rss}KB")
    except Exception as e:
        print(f"  [进程信息获取失败] {e}")

    # 数据库文件大小
    db_path = "/workspace/data/pai.db"
    if os.path.exists(db_path):
        size = os.path.getsize(db_path)
        print(f"  数据库文件  {size / 1024:.1f} KB ({size / 1024 / 1024:.2f} MB)")

    wal_path = db_path + "-wal"
    if os.path.exists(wal_path):
        size = os.path.getsize(wal_path)
        print(f"  WAL 文件    {size / 1024:.1f} KB")

    # 数据量统计
    r, _ = http("GET", "/api/students?q=", token=TOKEN)
    if r.get("code") == 0:
        count = len(r["data"].get("students", []))
        print(f"  学员总数    {count}")

    r, _ = http("GET", "/api/courses", token=TOKEN)
    if r.get("code") == 0:
        count = len(r["data"].get("courses", []))
        print(f"  课程总数    {count}")


# ============ 主流程 ============

def main():
    print("=" * 60)
    print("  排课系统多维度性能测试")
    print("  时间: " + time.strftime("%Y-%m-%d %H:%M:%S"))
    print("=" * 60)

    login()

    # 准备测试数据
    print("\n[准备] 检查/创建测试数据...")
    ensure_grade("一年级")
    course_id = ensure_course("性能测试课程")

    # 检查现有学员数量
    r, _ = http("GET", "/api/students?q=perf_", token=TOKEN)
    existing = r["data"].get("students", []) if r.get("code") == 0 else []
    print(f"[准备] 现有 perf_ 学员: {len(existing)}")

    # 如不足 200 个，补齐到 200
    if len(existing) < 200:
        need = 200 - len(existing)
        print(f"[准备] 补充创建 {need} 个学员...")
        new_ids = create_students(need)
        for sid in new_ids:
            create_enrollment(sid, course_id, hours=20)
    else:
        new_ids = []

    # 收集所有 perf_ 学员
    r, _ = http("GET", "/api/students?q=perf_", token=TOKEN)
    all_perf = r["data"].get("students", []) if r.get("code") == 0 else []
    student_ids = [s["id"] for s in all_perf]
    print(f"[准备] 测试学员总数: {len(student_ids)}")

    # 执行各维度测试
    d1_basic_latency()
    d2_concurrency()
    d3_db_query(student_ids)
    d4_business_tx(student_ids, course_id)
    d5_reports()
    d6_search(student_ids)
    d7_auth()
    d8_write_throughput(course_id)
    d9_system()

    print("\n" + "=" * 60)
    print("  性能测试完成")
    print("=" * 60)


if __name__ == "__main__":
    main()
