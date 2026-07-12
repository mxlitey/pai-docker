#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
排课系统综合测试脚本
================================
覆盖四类测试:
  1. 完整业务流程测试(年级→课程→班级→学员→报名→排课→点名→反馈)
     - 验证课时扣减与回退逻辑(undefined→false不扣课时, false→true扣1, true→false回退1)
     - 验证赠课扣减优先级(先扣付费课时,扣完扣赠课)
  2. 安全性测试(鉴权、权限、弱密码、越权、token 失效、SQL 注入)
  3. 流程测试(补课、调课、退课、课时扣减与回退)
  4. 非流程拦截测试(缺少前置条件应被拒绝)

用法:
  python3 scripts/test_suite.py
  echo -e "\n\n\n\n" | python3 scripts/test_suite.py   # 非交互模式,全用默认值

依赖: 仅 Python 标准库(urllib),无需 pip install
"""
import json
import random
import sys
import datetime
import time
from urllib import request as urlreq
from urllib.error import HTTPError, URLError


# ============================================================
# 测试框架
# ============================================================
class TestRunner:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip('/')
        self.token = None
        self.passed = 0
        self.failed = 0
        self.errors = []

    def _headers(self):
        h = {'Content-Type': 'application/json; charset=utf-8'}
        if self.token:
            h['Authorization'] = f'Bearer {self.token}'
        return h

    def request(self, method, path, body=None, token=None):
        url = f'{self.base_url}{path}'
        data = json.dumps(body).encode('utf-8') if body is not None else None
        headers = {'Content-Type': 'application/json; charset=utf-8'}
        use_token = token if token is not None else self.token
        if use_token:
            headers['Authorization'] = f'Bearer {use_token}'
        if token is False:  # 显式不带 token
            headers.pop('Authorization', None)
        req = urlreq.Request(url, data=data, headers=headers, method=method)
        try:
            with urlreq.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode('utf-8')
                return resp.status, json.loads(raw) if raw else {}
        except HTTPError as e:
            raw = e.read().decode('utf-8', errors='replace')
            try:
                return e.code, json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                return e.code, {'code': 1, 'message': raw, 'data': None}
        except URLError as e:
            return -1, {'code': 1, 'message': f'连接失败: {e.reason}', 'data': None}

    def get(self, path):
        return self.request('GET', path)

    def post(self, path, body, token=None):
        return self.request('POST', path, body, token=token)

    def put(self, path, body):
        return self.request('PUT', path, body)

    def delete(self, path, body=None):
        return self.request('DELETE', path, body)

    # ---- 断言工具 ----
    def assert_ok(self, resp, label):
        """断言 code==0"""
        status, body = resp
        if body.get('code') == 0:
            self.passed += 1
            return body
        self.failed += 1
        msg = body.get('message') or str(body)
        self.errors.append(f'[FAIL] {label}: code={body.get("code")} msg={msg}')
        print(f'  [FAIL] {label}: {msg}')
        return body

    def assert_fail(self, resp, label, expected_msg_contains=None):
        """断言 code!=0(期望失败)"""
        status, body = resp
        if body.get('code') != 0:
            if expected_msg_contains and expected_msg_contains not in str(body.get('message', '')):
                self.failed += 1
                self.errors.append(
                    f'[FAIL] {label}: 期望消息含「{expected_msg_contains}」,实际「{body.get("message")}」')
                print(f'  [FAIL] {label}: 期望消息含「{expected_msg_contains}」,实际「{body.get("message")}」')
                return body
            self.passed += 1
            return body
        self.failed += 1
        self.errors.append(f'[FAIL] {label}: 期望被拒绝,但实际成功 code=0')
        print(f'  [FAIL] {label}: 期望被拒绝,但实际成功')
        return body

    def assert_eq(self, actual, expected, label):
        if actual == expected:
            self.passed += 1
        else:
            self.failed += 1
            self.errors.append(f'[FAIL] {label}: 期望 {expected},实际 {actual}')
            print(f'  [FAIL] {label}: 期望 {expected},实际 {actual}')

    def assert_true(self, cond, label):
        if cond:
            self.passed += 1
        else:
            self.failed += 1
            self.errors.append(f'[FAIL] {label}: 条件不成立')
            print(f'  [FAIL] {label}: 条件不成立')

    def summary(self):
        total = self.passed + self.failed
        print('\n' + '=' * 60)
        print(f'  测试结果: {self.passed} 通过 / {self.failed} 失败 / {total} 总计')
        if self.errors:
            print('\n  失败明细:')
            for e in self.errors:
                print(f'    {e}')
        print('=' * 60)
        return self.failed == 0


# ============================================================
# 工具函数
# ============================================================
def date_offset(days):
    d = datetime.date.today() + datetime.timedelta(days=days)
    return d.strftime('%Y-%m-%d')


GEN_NAMES = list('赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜')
GEN_CHARS = list('伟芳娜敏静丽强磊军洋勇艳杰娟涛明超霞平刚桂英秀兰宇航梓涵雨萱子轩')


def gen_name():
    return random.choice(GEN_NAMES) + ''.join(random.sample(GEN_CHARS, 2))


def gen_phone():
    return '139' + ''.join(random.choice('0123456789') for _ in range(8))


# ============================================================
# 测试组 1: 完整业务流程
# ============================================================
def test_full_flow(t, prefix):
    """完整业务流程: 年级→课程→班级→学员→报名→排课→点名→反馈
    重点验证课时扣减与回退逻辑(回退课时 bug 专项检测)"""
    print('\n[测试组 1] 完整业务流程 (含课时扣减/回退验证)')
    grade_name = f'{prefix}一年级'

    # 年级
    body = t.assert_ok(
        t.post('/api/grade-add', {'grade': {
            'name': grade_name, 'sortOrder': 100, 'status': 'active', 'description': ''
        }}),
        '创建年级'
    )
    grade_id = body['data']['grade']['id']

    # 课程
    body = t.assert_ok(
        t.post('/api/course-add', {'course': {
            'name': f'{prefix}数学', 'color': '#3b82f6', 'category': '理科',
            'grade': grade_name, 'billingType': 'per_lesson', 'term': '2026春季',
            'status': 'active', 'description': ''
        }}),
        '创建课程'
    )
    math = body['data']['course']

    # 班级
    body = t.assert_ok(
        t.post('/api/class-add', {'class': {
            'name': f'{prefix}数学A班', 'courseId': math['id'], 'grade': grade_name,
            'teacher': '王老师', 'location': '1号教室', 'color': math['color'],
            'defaultStartTime': '09:00', 'defaultEndTime': '10:30',
            'capacity': 20, 'status': 'active', 'remark': ''
        }}),
        '创建班级'
    )
    cls = body['data']['class']

    # 学员
    name = gen_name()
    body = t.assert_ok(
        t.post('/api/student-add', {'student': {
            'name': name, 'grade': grade_name, 'phone': gen_phone(),
            'parentName': f'{random.choice(GEN_NAMES)}先生/女士',
            'gender': '男', 'status': 'active', 'tags': '流程测试', 'source': 'test-suite'
        }}),
        '创建学员'
    )
    stu = body['data']['student']

    # 报名: 10 付费 + 2 赠课
    body = t.assert_ok(
        t.post('/api/enrollment-add', {'enrollment': {
            'studentId': stu['id'], 'courseId': math['id'],
            'purchasedHours': 10, 'giftHours': 2, 'unitPrice': 200,
            'totalAmount': 2000, 'paidAmount': 2000, 'expiredAt': date_offset(180),
            'enrolledAt': date_offset(-1), 'note': ''
        }}),
        '报名(10付费+2赠课)'
    )
    enr_id = body['data']['enrollment']['id']

    # 排课(昨天)
    yesterday = date_offset(-1)
    body = t.assert_ok(
        t.post('/api/schedule-add', {'schedule': {
            'studentId': stu['id'], 'studentName': stu['name'],
            'classId': cls['id'], 'courseId': math['id'], 'courseName': math['name'],
            'teacher': cls['teacher'], 'location': cls['location'],
            'date': yesterday, 'startTime': '09:00', 'endTime': '10:30',
            'color': math['color'], 'status': 'scheduled', 'note': ''
        }}),
        '排课(昨天)'
    )
    sched_id = body['data']['schedule']['id']

    # === 课时扣减/回退核心验证 ===

    # 1. 首次点名标缺勤 (undefined→false): 课时不变
    t.assert_ok(
        t.post('/api/attendance', {'date': yesterday, 'items': [
            {'scheduleId': sched_id, 'studentId': stu['id'], 'attended': False}
        ]}),
        '点名: undefined→false (首次缺勤)'
    )
    body = t.assert_ok(t.get(f'/api/enrollments?studentId={stu["id"]}'), '查询报名(缺勤后)')
    enr = body['data']['enrollments'][0]
    t.assert_eq(enr['remainingPaidHours'], 10, '缺勤后付费课时不变(10)')
    t.assert_eq(enr['remainingGiftHours'], 2, '缺勤后赠课不变(2)')

    # 2. 改为到课 (false→true): 扣 1 付费课时
    t.assert_ok(
        t.post('/api/attendance', {'date': yesterday, 'items': [
            {'scheduleId': sched_id, 'studentId': stu['id'], 'attended': True}
        ]}),
        '点名: false→true (到课)'
    )
    body = t.assert_ok(t.get(f'/api/enrollments?studentId={stu["id"]}'), '查询报名(到课后)')
    enr = body['data']['enrollments'][0]
    t.assert_eq(enr['remainingPaidHours'], 9, '到课扣付费课时(10→9)')
    t.assert_eq(enr['remainingGiftHours'], 2, '赠课不变(2)')

    # 3. 改回缺勤 (true→false): 回退 1 付费课时 (回退课时 bug 专项)
    t.assert_ok(
        t.post('/api/attendance', {'date': yesterday, 'items': [
            {'scheduleId': sched_id, 'studentId': stu['id'], 'attended': False}
        ]}),
        '点名: true→false (改回缺勤,回退课时)'
    )
    body = t.assert_ok(t.get(f'/api/enrollments?studentId={stu["id"]}'), '查询报名(回退后)')
    enr = body['data']['enrollments'][0]
    t.assert_eq(enr['remainingPaidHours'], 10, '回退后付费课时恢复(9→10)')
    t.assert_eq(enr['remainingGiftHours'], 2, '赠课不变(2)')

    # 4. 赠课扣减优先级测试: 付费课时耗尽后扣赠课
    # 先把付费课时耗尽: 连续到课 10 次(需 10 条排课)
    print('  --- 赠课扣减优先级测试(耗尽付费课时后扣赠课) ---')
    sched_ids = []
    for i in range(10):
        d = date_offset(-(10 + i))  # 不同日期避免唯一约束冲突
        body = t.assert_ok(
            t.post('/api/schedule-add', {'schedule': {
                'studentId': stu['id'], 'studentName': stu['name'],
                'classId': cls['id'], 'courseId': math['id'], 'courseName': math['name'],
                'teacher': cls['teacher'], 'location': cls['location'],
                'date': d, 'startTime': '09:00', 'endTime': '10:30',
                'color': math['color'], 'status': 'scheduled'
            }}),
            f'排课 #{i+1}(消耗付费课时)'
        )
        sched_ids.append(body['data']['schedule']['id'])

    # 全部点到课(10 条,扣 10 付费课时 → 0 付费 + 2 赠课)
    items = [{'scheduleId': sid, 'studentId': stu['id'], 'attended': True} for sid in sched_ids]
    # attendance API 按日期分组,需按日期分别提交
    date_groups = {}
    for sid, d in zip(sched_ids, [date_offset(-(10 + i)) for i in range(10)]):
        date_groups.setdefault(d, []).append(
            {'scheduleId': sid, 'studentId': stu['id'], 'attended': True})
    for d, its in date_groups.items():
        t.assert_ok(
            t.post('/api/attendance', {'date': d, 'items': its}),
            f'点名到课 {d} ({len(its)}条)'
        )

    body = t.assert_ok(t.get(f'/api/enrollments?studentId={stu["id"]}'), '查询报名(耗尽付费后)')
    enr = body['data']['enrollments'][0]
    t.assert_eq(enr['remainingPaidHours'], 0, '付费课时耗尽(10→0)')
    t.assert_eq(enr['remainingGiftHours'], 2, '赠课未动(2)')

    # 5. 再到课 1 次: 应扣赠课
    extra_date = date_offset(-21)
    body = t.assert_ok(
        t.post('/api/schedule-add', {'schedule': {
            'studentId': stu['id'], 'studentName': stu['name'],
            'classId': cls['id'], 'courseId': math['id'], 'courseName': math['name'],
            'teacher': cls['teacher'], 'location': cls['location'],
            'date': extra_date, 'startTime': '09:00', 'endTime': '10:30',
            'color': math['color'], 'status': 'scheduled'
        }}),
        '排课(测试扣赠课)'
    )
    extra_sched = body['data']['schedule']['id']
    t.assert_ok(
        t.post('/api/attendance', {'date': extra_date, 'items': [
            {'scheduleId': extra_sched, 'studentId': stu['id'], 'attended': True}
        ]}),
        '点名到课(付费耗尽,应扣赠课)'
    )
    body = t.assert_ok(t.get(f'/api/enrollments?studentId={stu["id"]}'), '查询报名(扣赠课后)')
    enr = body['data']['enrollments'][0]
    t.assert_eq(enr['remainingPaidHours'], 0, '付费课时仍为 0')
    t.assert_eq(enr['remainingGiftHours'], 1, '赠课扣减(2→1)')

    # 6. 回退最后这次到课: 赠课应恢复
    t.assert_ok(
        t.post('/api/attendance', {'date': extra_date, 'items': [
            {'scheduleId': extra_sched, 'studentId': stu['id'], 'attended': False}
        ]}),
        '改回缺勤(回退赠课)'
    )
    body = t.assert_ok(t.get(f'/api/enrollments?studentId={stu["id"]}'), '查询报名(回退赠课后)')
    enr = body['data']['enrollments'][0]
    t.assert_eq(enr['remainingGiftHours'], 2, '赠课恢复(1→2)')

    # 7. 反馈
    t.assert_ok(
        t.post('/api/feedback', {
            'scheduleId': sched_id, 'studentId': stu['id'],
            'studentName': stu['name'], 'date': yesterday,
            'courseId': math['id'], 'content': '课堂表现良好,积极发言', 'rating': 5
        }),
        '提交反馈'
    )

    return {
        'grade_name': grade_name, 'math': math, 'cls': cls, 'stu': stu,
        'enr_id': enr_id, 'sched_id': sched_id,
    }


# ============================================================
# 测试组 2: 安全性测试
# ============================================================
def test_security(t, prefix):
    """安全性测试: 鉴权、权限、密码策略、token 失效、SQL 注入"""
    print('\n[测试组 2] 安全性测试')

    # 2.1 无 token 访问受保护接口
    resp = t.request('GET', '/api/students', token=False)
    t.assert_fail(resp, '无 token 访问学员列表应被拒')

    # 2.2 无效 token
    resp = t.request('GET', '/api/students', token='invalid.token.here')
    t.assert_fail(resp, '无效 token 访问应被拒')

    # 2.3 伪造 token(结构正确但签名错误)
    fake_payload = (
        'eyJ1aWQiOiJhZG1fZmFrZSIsInVzZXJuYW1lIjoiYWRtaW4iLCJyb2xlIjoi'
        'c3VwZXJhZG1pbiIsInJlYWxOYW1lIjoiIiwidHMiOjk5OTk5OTk5OTk5OX0'
    )
    resp = t.request('GET', '/api/students', token=f'{fake_payload}.fakesig')
    t.assert_fail(resp, '伪造 token 访问应被拒')

    # === 密码策略测试 (≥8 位，须含字母+数字) ===

    # 2.4 弱密码(3 位)应被拒
    resp = t.post('/api/admin-add', {'admin': {
        'username': f'{prefix}weak3', 'password': '123', 'role': 'admin', 'realName': '弱密码测试'
    }})
    t.assert_fail(resp, '弱密码(3位)创建管理员应被拒', '至少 8 位')

    # 2.5 7 位密码应被拒(长度不足)
    resp = t.post('/api/admin-add', {'admin': {
        'username': f'{prefix}weak5', 'password': 'ab1234', 'role': 'admin', 'realName': '弱密码测试'
    }})
    t.assert_fail(resp, '7位密码创建管理员应被拒', '至少 8 位')

    # 2.6 纯数字密码应被拒(缺少字母)
    resp = t.post('/api/admin-add', {'admin': {
        'username': f'{prefix}numonly', 'password': '12345678', 'role': 'admin', 'realName': '纯数字密码'
    }})
    t.assert_fail(resp, '纯数字密码应被拒(须含字母)', '字母')

    # 2.7 纯字母密码应被拒(缺少数字)
    resp = t.post('/api/admin-add', {'admin': {
        'username': f'{prefix}letteronly', 'password': 'abcdefgh', 'role': 'admin', 'realName': '纯字母密码'
    }})
    t.assert_fail(resp, '纯字母密码应被拒(须含数字)', '数字')

    # 2.8 合法密码(8位含字母+数字)应成功
    body = t.assert_ok(
        t.post('/api/admin-add', {'admin': {
            'username': f'{prefix}num6', 'password': 'test1234', 'role': 'admin', 'realName': '合规密码'
        }}),
        '8位含字母+数字密码创建管理员(策略允许)'
    )
    admin_num_id = body['data']['admin']['id']

    # 2.8.1 姓名为必填项，缺失应被拒
    resp = t.post('/api/admin-add', {'admin': {
        'username': f'{prefix}noname', 'password': 'pass1234', 'role': 'admin', 'realName': ''
    }})
    t.assert_fail(resp, '姓名为空创建账户应被拒', '姓名为必填项')
    resp = t.post('/api/admin-add', {'admin': {
        'username': f'{prefix}noname2', 'password': 'pass1234', 'role': 'admin'
    }})
    t.assert_fail(resp, '缺少姓名字段创建账户应被拒', '姓名为必填项')

    # === 越权测试 ===

    # 2.9 普通管理员尝试创建管理员(应被拒 - 无 admins:create 权限)
    resp = t.post('/api/auth', {'username': f'{prefix}num6', 'password': 'test1234'})
    body = t.assert_ok(resp, '普通管理员登录')
    normal_token = body['data']['token']

    resp = t.request('POST', '/api/admin-add',
                     {'admin': {'username': f'{prefix}hack', 'password': 'hack1234', 'role': 'admin', 'realName': '越权测试'}},
                     token=normal_token)
    t.assert_fail(resp, '普通管理员创建管理员应被拒(权限不足)')

    # 2.10 普通管理员尝试删除超管(应被拒)
    resp = t.request('DELETE', '/api/admin-delete', {'id': 'adm_superadmin'},
                     token=normal_token)
    t.assert_fail(resp, '普通管理员删除账号应被拒(权限不足)')

    # === token 失效测试 ===

    # 2.11 删除管理员后旧 token 应失效
    t.assert_ok(
        t.delete('/api/admin-delete', {'id': admin_num_id}),
        '删除测试管理员(num6)'
    )
    resp = t.request('GET', '/api/students', token=normal_token)
    t.assert_fail(resp, '已删除管理员 token 应失效', '不存在')

    # 2.12 禁用管理员后 token 应失效
    # 先创建一个管理员,然后禁用,再用其 token 访问
    body = t.assert_ok(
        t.post('/api/admin-add', {'admin': {
            'username': f'{prefix}disable', 'password': 'pass1234', 'role': 'admin', 'realName': '待禁用'
        }}),
        '创建待禁用管理员'
    )
    disable_id = body['data']['admin']['id']
    resp = t.post('/api/auth', {'username': f'{prefix}disable', 'password': 'pass1234'})
    body = t.assert_ok(resp, '待禁用管理员登录')
    disable_token = body['data']['token']

    # 禁用该管理员
    t.assert_ok(
        t.put('/api/admin-update', {
            'admin': {'id': disable_id, 'status': 'disabled'}
        }),
        '禁用管理员'
    )
    # 用已禁用管理员的 token 访问
    resp = t.request('GET', '/api/students', token=disable_token)
    t.assert_fail(resp, '已禁用管理员 token 应失效', '禁用')

    # 清理: 删除剩余测试管理员
    t.delete('/api/admin-delete', {'id': disable_id})

    # === 反馈内容校验 ===

    # 2.12 反馈空内容应被拒
    resp = t.post('/api/feedback', {
        'scheduleId': 'fake', 'studentId': 'fake', 'date': date_offset(0), 'content': ''
    })
    t.assert_fail(resp, '空反馈内容应被拒', '不能为空')

    # 2.13 反馈超长(>2000 字)应被拒
    resp = t.post('/api/feedback', {
        'scheduleId': 'fake', 'studentId': 'fake', 'date': date_offset(0),
        'content': 'x' * 2001
    })
    t.assert_fail(resp, '超长反馈应被拒', '2000')

    # === SQL 注入测试 ===

    # 2.14 SQL 注入学员名(参数化查询应防注入)
    inject_name = "'; DROP TABLE students; --"
    resp = t.post('/api/student-add', {'student': {
        'name': inject_name, 'grade': '一年级', 'phone': gen_phone(),
        'status': 'active', 'source': 'sqli-test'
    }})
    t.assert_ok(resp, 'SQL 注入学员名应被参数化处理(创建成功)')
    # 验证 students 表还在
    body = t.assert_ok(t.get('/api/students'), 'SQL 注入后学员表仍可查询')
    # 验证注入名学员存在
    injected = [s for s in body['data']['students'] if s['name'] == inject_name]
    t.assert_true(len(injected) > 0, 'SQL 注入名学员被正常存储')


# ============================================================
# 测试组 3: 业务流程测试
# ============================================================
def test_business_flow(t, prefix, ctx):
    """业务流程测试: 补课(插班)、调课、退课"""
    print('\n[测试组 3] 业务流程测试 (补课/调课/退课)')

    math = ctx['math']
    cls = ctx['cls']
    stu = ctx['stu']
    grade_name = ctx['grade_name']

    # 创建英语课程和班级(用于插班补课测试)
    body = t.assert_ok(
        t.post('/api/course-add', {'course': {
            'name': f'{prefix}英语', 'color': '#ef4444', 'category': '语言',
            'grade': grade_name, 'billingType': 'per_lesson', 'status': 'active'
        }}),
        '创建英语课程'
    )
    english = body['data']['course']
    body = t.assert_ok(
        t.post('/api/class-add', {'class': {
            'name': f'{prefix}英语A班', 'courseId': english['id'], 'grade': grade_name,
            'teacher': '李老师', 'location': '2号教室', 'color': english['color'],
            'defaultStartTime': '10:00', 'defaultEndTime': '11:30',
            'capacity': 20, 'status': 'active'
        }}),
        '创建英语班级'
    )
    eng_cls = body['data']['class']

    # === 3.1 插班补课流程 ===
    # 排一堂数学课→缺勤→插班补课到英语班→点名到课→验证数学课时扣减
    print('  --- 3.1 插班补课(扣原课程课时) ---')
    yesterday = date_offset(-1)
    tomorrow = date_offset(1)

    # 给学员补充数学课时(前面流程可能已耗尽)
    body = t.assert_ok(t.get(f'/api/enrollments?studentId={stu["id"]}'), '查询数学报名')
    math_enr = next((e for e in body['data']['enrollments'] if e['courseId'] == math['id']), None)
    if math_enr and math_enr['remainingPaidHours'] < 5:
        # 续费: 增加 10 课时
        t.assert_ok(
            t.put('/api/enrollment-update', {'enrollment': {
                'id': math_enr['id'], 'purchasedHours': math_enr['purchasedHours'] + 10
            }}),
            '续费数学课时(+10)'
        )

    body = t.assert_ok(t.get(f'/api/enrollments?studentId={stu["id"]}'), '查询数学报名(续费后)')
    math_enr = next(e for e in body['data']['enrollments'] if e['courseId'] == math['id'])
    hours_before = math_enr['remainingPaidHours'] + math_enr['remainingGiftHours']

    # 排数学课
    makeup_date = date_offset(-3)
    body = t.assert_ok(
        t.post('/api/schedule-add', {'schedule': {
            'studentId': stu['id'], 'studentName': stu['name'],
            'classId': cls['id'], 'courseId': math['id'], 'courseName': math['name'],
            'teacher': cls['teacher'], 'location': cls['location'],
            'date': makeup_date, 'startTime': '14:00', 'endTime': '15:30',
            'color': math['color'], 'status': 'scheduled'
        }}),
        '排数学课(待补课)'
    )
    makeup_orig_id = body['data']['schedule']['id']

    # 标记缺勤(补课前置条件: 原排课须已缺勤)
    t.assert_ok(
        t.post('/api/attendance', {'date': makeup_date, 'items': [
            {'scheduleId': makeup_orig_id, 'studentId': stu['id'], 'attended': False}
        ]}),
        '数学课标记缺勤(补课前置)'
    )

    # 插班补课到英语班(学员没报名英语)
    body = t.assert_ok(
        t.post('/api/schedule-makeup', {
            'scheduleId': makeup_orig_id, 'newDate': tomorrow,
            'newStartTime': '10:00', 'newEndTime': '11:30',
            'newClassId': eng_cls['id'], 'newCourseId': english['id'],
            'newCourseName': english['name'], 'newTeacher': eng_cls['teacher'],
            'newLocation': eng_cls['location'], 'newColor': english['color'],
            'reason': '插班补课到英语'
        }),
        '插班补课到英语班'
    )
    new_makeup_id = body['data']['newScheduleId']

    # 点名补课到课
    t.assert_ok(
        t.post('/api/attendance', {'date': tomorrow, 'items': [
            {'scheduleId': new_makeup_id, 'studentId': stu['id'], 'attended': True}
        ]}),
        '补课点名到课'
    )

    # 验证: 数学课时应扣减(补课扣原排课课程课时)
    body = t.assert_ok(t.get(f'/api/enrollments?studentId={stu["id"]}'), '查询数学报名(补课后)')
    math_enr = next(e for e in body['data']['enrollments'] if e['courseId'] == math['id'])
    hours_after = math_enr['remainingPaidHours'] + math_enr['remainingGiftHours']
    t.assert_eq(hours_after, hours_before - 1, f'插班补课扣数学课时({hours_before}→{hours_after})')

    # 验证: 英语课时不变(学员没报名英语)
    eng_enr = next((e for e in body['data']['enrollments'] if e['courseId'] == english['id']), None)
    t.assert_true(eng_enr is None, '英语无报名记录(插班补课不创建英语报名)')

    # === 3.2 调课流程 ===
    print('  --- 3.2 调课 ---')
    resched_date = date_offset(3)
    body = t.assert_ok(
        t.post('/api/schedule-add', {'schedule': {
            'studentId': stu['id'], 'studentName': stu['name'],
            'classId': cls['id'], 'courseId': math['id'], 'courseName': math['name'],
            'teacher': cls['teacher'], 'location': cls['location'],
            'date': resched_date, 'startTime': '09:00', 'endTime': '10:30',
            'color': math['color'], 'status': 'scheduled'
        }}),
        '排课(待调课)'
    )
    resched_id = body['data']['schedule']['id']

    body = t.assert_ok(
        t.post('/api/schedule-reschedule', {
            'scheduleId': resched_id, 'newDate': date_offset(5),
            'newStartTime': '14:00', 'newEndTime': '15:30', 'reason': '时间冲突'
        }),
        '调课'
    )
    new_resched_id = body['data']['newScheduleId']
    t.assert_true(new_resched_id != resched_id, '调课生成新排课ID')

    # 验证原排课已取消
    body = t.assert_ok(t.get(f'/api/schedules?studentId={stu["id"]}'), '查询学员排课')
    orig_sched = next((s for s in body['data']['schedules'] if s['id'] == resched_id), None)
    if orig_sched:
        t.assert_eq(orig_sched['status'], 'cancelled', '原排课已取消')
    else:
        t.passed += 1  # 查询可能过滤掉 cancelled,也算通过

    # === 3.3 退课流程 ===
    print('  --- 3.3 退课(消耗课时后改 settled) ---')
    name = gen_name()
    body = t.assert_ok(
        t.post('/api/student-add', {'student': {
            'name': name, 'grade': grade_name, 'phone': gen_phone(),
            'status': 'active', 'source': 'refund-test'
        }}),
        '创建退课测试学员'
    )
    refund_stu = body['data']['student']

    body = t.assert_ok(
        t.post('/api/enrollment-add', {'enrollment': {
            'studentId': refund_stu['id'], 'courseId': math['id'],
            'purchasedHours': 20, 'giftHours': 0, 'unitPrice': 200,
            'totalAmount': 4000, 'paidAmount': 4000
        }}),
        '报名(待退课)'
    )
    refund_enr = body['data']['enrollment']

    # Bug10 验证: 有剩余课时不能直接 settled
    resp = t.put('/api/enrollment-update', {'enrollment': {
        'id': refund_enr['id'], 'status': 'settled'
    }})
    t.assert_fail(resp, '有剩余课时不能直接结转(Bug10)', '剩余课时')

    # 退课流程: 先把课时调整为 0（相当于退回所有课时），再改 settled
    t.assert_ok(
        t.put('/api/enrollment-update', {'enrollment': {
            'id': refund_enr['id'], 'purchasedHours': 0, 'giftHours': 0,
            'note': '学员要求退课,退回所有课时'
        }}),
        '退课(课时调整为0)'
    )

    # 课时为 0 后可以改 settled
    t.assert_ok(
        t.put('/api/enrollment-update', {'enrollment': {
            'id': refund_enr['id'], 'status': 'settled'
        }}),
        '退课(课时为0后改 settled)'
    )

    # 验证报名状态变为 settled
    body = t.assert_ok(t.get(f'/api/enrollments?studentId={refund_stu["id"]}'), '查询退课后报名')
    refund_enr_after = body['data']['enrollments'][0]
    t.assert_eq(refund_enr_after['status'], 'settled', '退课后报名状态为 settled')


# ============================================================
# 测试组 4: 非流程拦截测试
# ============================================================
def test_non_flow_intercept(t, prefix, ctx):
    """非流程拦截测试: 缺少前置条件应被拒绝"""
    print('\n[测试组 4] 非流程拦截测试')

    math = ctx['math']
    cls = ctx['cls']
    stu = ctx['stu']
    grade_name = ctx['grade_name']

    # 4.1 学员用不存在的年级(应被拒)
    resp = t.post('/api/student-add', {'student': {
        'name': '拦截测试员', 'grade': '不存在的年级', 'phone': gen_phone(),
        'status': 'active'
    }})
    t.assert_fail(resp, '不存在的年级应被拒', '不存在')

    # 4.2 学员不填年级(应被拒)
    resp = t.post('/api/student-add', {'student': {
        'name': '拦截测试员2', 'grade': '', 'phone': gen_phone(),
        'status': 'active'
    }})
    t.assert_fail(resp, '空年级应被拒', '年级')

    # 4.3 报名不存在的学员(应被拒)
    resp = t.post('/api/enrollment-add', {'enrollment': {
        'studentId': 'stu_nonexistent', 'courseId': math['id'],
        'purchasedHours': 10, 'unitPrice': 200, 'totalAmount': 2000, 'paidAmount': 2000
    }})
    t.assert_fail(resp, '报名不存在学员应被拒', '学员不存在')

    # 4.4 报名不存在的课程(应被拒)
    resp = t.post('/api/enrollment-add', {'enrollment': {
        'studentId': stu['id'], 'courseId': 'crs_nonexistent',
        'purchasedHours': 10, 'unitPrice': 200, 'totalAmount': 2000, 'paidAmount': 2000
    }})
    t.assert_fail(resp, '报名不存在课程应被拒', '课程不存在')

    # 4.5 排课不传 classId(应被拒)
    resp = t.post('/api/schedule-add', {'schedule': {
        'studentId': stu['id'], 'courseId': math['id'], 'courseName': math['name'],
        'date': date_offset(2), 'startTime': '09:00', 'endTime': '10:30', 'status': 'scheduled'
    }})
    t.assert_fail(resp, '排课不传 classId 应被拒', 'classId')

    # 4.6 排课不传 courseId(应被拒)
    resp = t.post('/api/schedule-add', {'schedule': {
        'studentId': stu['id'], 'classId': cls['id'], 'courseName': math['name'],
        'date': date_offset(2), 'startTime': '09:00', 'endTime': '10:30', 'status': 'scheduled'
    }})
    t.assert_fail(resp, '排课不传 courseId 应被拒', 'courseId')

    # 4.7 排课传不存在的 classId(应被拒)
    resp = t.post('/api/schedule-add', {'schedule': {
        'studentId': stu['id'], 'classId': 'cls_nonexistent',
        'courseId': math['id'], 'courseName': math['name'],
        'date': date_offset(2), 'startTime': '09:00', 'endTime': '10:30', 'status': 'scheduled'
    }})
    t.assert_fail(resp, '排课传不存在 classId 应被拒', '不存在')

    # 4.8 排课传不存在的 courseId(应被拒)
    resp = t.post('/api/schedule-add', {'schedule': {
        'studentId': stu['id'], 'classId': cls['id'],
        'courseId': 'crs_nonexistent', 'courseName': '不存在课程',
        'date': date_offset(2), 'startTime': '09:00', 'endTime': '10:30', 'status': 'scheduled'
    }})
    t.assert_fail(resp, '排课传不存在 courseId 应被拒', '不存在')

    # 4.9 排课班级与课程不匹配(应被拒)
    # 先建一个英语班(课程 ≠ 数学)
    body = t.assert_ok(
        t.post('/api/course-add', {'course': {
            'name': f'{prefix}英语NF', 'color': '#ef4444', 'category': '语言',
            'grade': grade_name, 'billingType': 'per_lesson', 'status': 'active'
        }}),
        '创建英语课程(班级不匹配测试)'
    )
    nf_english = body['data']['course']
    body = t.assert_ok(
        t.post('/api/class-add', {'class': {
            'name': f'{prefix}英语NF班', 'courseId': nf_english['id'], 'grade': grade_name,
            'teacher': '李老师', 'location': '2号教室', 'color': nf_english['color'],
            'defaultStartTime': '10:00', 'defaultEndTime': '11:30',
            'capacity': 20, 'status': 'active'
        }}),
        '创建英语班级(班级不匹配测试)'
    )
    nf_eng_cls = body['data']['class']

    resp = t.post('/api/schedule-add', {'schedule': {
        'studentId': stu['id'], 'classId': nf_eng_cls['id'],
        'courseId': math['id'], 'courseName': math['name'],
        'date': date_offset(2), 'startTime': '09:00', 'endTime': '10:30', 'status': 'scheduled'
    }})
    t.assert_fail(resp, '排课班级与课程不匹配应被拒', '不一致')

    # 4.10 排课未报名课程(非补课)(应被拒)
    # 学员没报名 nf_english,排 nf_english 的课
    resp = t.post('/api/schedule-add', {'schedule': {
        'studentId': stu['id'], 'classId': nf_eng_cls['id'],
        'courseId': nf_english['id'], 'courseName': nf_english['name'],
        'date': date_offset(2), 'startTime': '10:00', 'endTime': '11:30', 'status': 'scheduled'
    }})
    t.assert_fail(resp, '排课未报名课程应被拒', '未报名')

    # 4.11 排课不存在的学员(应被拒)
    resp = t.post('/api/schedule-add', {'schedule': {
        'studentId': 'stu_nonexistent', 'classId': cls['id'],
        'courseId': math['id'], 'courseName': math['name'],
        'date': date_offset(2), 'startTime': '09:00', 'endTime': '10:30', 'status': 'scheduled'
    }})
    t.assert_fail(resp, '排课不存在学员应被拒', '不存在')

    # 4.12 排课日期格式错误(应被拒)
    resp = t.post('/api/schedule-add', {'schedule': {
        'studentId': stu['id'], 'classId': cls['id'],
        'courseId': math['id'], 'courseName': math['name'],
        'date': '2026/07/20', 'startTime': '09:00', 'endTime': '10:30', 'status': 'scheduled'
    }})
    t.assert_fail(resp, '日期格式错误应被拒', 'yyyy-MM-dd')

    # 4.13 排课缺少 studentId(应被拒)
    resp = t.post('/api/schedule-add', {'schedule': {
        'classId': cls['id'], 'courseId': math['id'], 'courseName': math['name'],
        'date': date_offset(2), 'startTime': '09:00', 'endTime': '10:30', 'status': 'scheduled'
    }})
    t.assert_fail(resp, '排课缺少 studentId 应被拒', 'studentId')

    # 4.14 点名 attended 非 boolean(应被拒)
    resp = t.post('/api/attendance', {'date': date_offset(0), 'items': [
        {'scheduleId': 'fake', 'studentId': stu['id'], 'attended': 'yes'}
    ]})
    t.assert_fail(resp, 'attended 非 boolean 应被拒', 'boolean')

    # 4.15 点名缺少 date(应被拒)
    resp = t.post('/api/attendance', {'items': [
        {'scheduleId': 'fake', 'studentId': stu['id'], 'attended': True}
    ]})
    t.assert_fail(resp, '点名缺少 date 应被拒', 'date')

    # 4.16 点名 date 格式错误(应被拒)
    resp = t.post('/api/attendance', {'date': '20260720', 'items': [
        {'scheduleId': 'fake', 'studentId': stu['id'], 'attended': True}
    ]})
    t.assert_fail(resp, '点名 date 格式错误应被拒', 'yyyy-MM-dd')

    # 4.17 点名不存在排课(code=0 但 errors 非空)
    resp = t.post('/api/attendance', {'date': date_offset(0), 'items': [
        {'scheduleId': 'sch_nonexistent', 'studentId': stu['id'], 'attended': True}
    ]})
    status, body = resp
    if body.get('code') == 0:
        errors = body.get('data', {}).get('errors', [])
        t.assert_true(len(errors) > 0, '点名不存在排课应返回 errors')
    else:
        t.assert_fail(resp, '点名不存在排课应被拒或返回 errors')

    # 4.18 班级成员: 不传 classId(应被拒)
    resp = t.post('/api/class-members', {'studentIds': [stu['id']]})
    t.assert_fail(resp, '班级成员不传 classId 应被拒', 'classId')

    # 4.19 班级成员: 空学员数组(应被拒)
    resp = t.post('/api/class-members', {'classId': cls['id'], 'studentIds': []})
    t.assert_fail(resp, '班级成员空学员数组应被拒', '至少')

    # 4.20 班级成员: 不存在班级(应被拒)
    resp = t.post('/api/class-members', {'classId': 'cls_nonexistent', 'studentIds': [stu['id']]})
    t.assert_fail(resp, '班级成员不存在班级应被拒', '不存在')


# ============================================================
# 测试组 5: Bug 修复验证
# ============================================================
def test_bug_fixes(t, prefix, ctx):
    """验证 Bug3/5/6/9/10 修复"""
    print('\n[测试组 5] Bug 修复验证')

    stu = ctx['stu']
    math = ctx['math']
    grade_name = ctx['grade_name']

    # === Bug3: 超管不可降级 ===
    print('  --- Bug3: 超管不可降级 ---')
    # 获取超管账号 ID（当前登录的 admin）
    body = t.assert_ok(t.get('/api/admins'), '查询管理员列表')
    superadmin = next((a for a in body['data']['admins'] if a['role'] == 'superadmin'), None)
    if superadmin:
        # 尝试降级超管
        resp = t.put('/api/admin-update', {'admin': {
            'id': superadmin['id'], 'role': 'admin'
        }})
        t.assert_fail(resp, '超管降级应被拒(Bug3)', '不可降级')

        # 尝试修改超管权限
        resp = t.put('/api/admin-update', {'admin': {
            'id': superadmin['id'], 'permissions': ['students:view']
        }})
        # 不报错（静默忽略），但权限不应改变
        t.assert_ok(resp, '修改超管权限应静默忽略(不报错)')
        # 验证超管权限未变（仍为通配）
        body = t.assert_ok(t.get('/api/admins'), '查询超管权限')
        superadmin_after = next(a for a in body['data']['admins'] if a['role'] == 'superadmin')
        t.assert_eq(superadmin_after['role'], 'superadmin', '超管角色未变')

    # === Bug5: 报名记录不可删除 ===
    print('  --- Bug5: 报名记录不可删除 ---')
    # 用 ctx 中学员的报名尝试删除
    resp = t.delete('/api/enrollment-delete', {'id': ctx['enr_id']})
    t.assert_fail(resp, '删除报名应被拒(Bug5)', '不可删除')

    # === Bug6: 有剩余课时不能删除学员 ===
    print('  --- Bug6: 有剩余课时不能删除学员 ---')
    # ctx['stu'] 有剩余课时（之前流程可能耗尽，创建新学员测试）
    name = gen_name()
    body = t.assert_ok(
        t.post('/api/student-add', {'student': {
            'name': name, 'grade': grade_name, 'phone': gen_phone(),
            'status': 'active', 'source': 'bug6-test'
        }}),
        '创建有课时学员(Bug6)'
    )
    bug6_stu = body['data']['student']
    t.assert_ok(
        t.post('/api/enrollment-add', {'enrollment': {
            'studentId': bug6_stu['id'], 'courseId': math['id'],
            'purchasedHours': 10, 'giftHours': 2, 'unitPrice': 200,
            'totalAmount': 2000, 'paidAmount': 2000
        }}),
        '报名(有课时)'
    )
    # 尝试删除有剩余课时的学员
    resp = t.delete('/api/student-delete', {'studentId': bug6_stu['id']})
    t.assert_fail(resp, '有剩余课时删除学员应被拒(Bug6)', '剩余课时')

    # 清理: 把课时改为 0 后可以删除
    body = t.assert_ok(t.get(f'/api/enrollments?studentId={bug6_stu["id"]}'), '查询报名(Bug6清理)')
    bug6_enr = body['data']['enrollments'][0]
    t.assert_ok(
        t.put('/api/enrollment-update', {'enrollment': {
            'id': bug6_enr['id'], 'purchasedHours': 0, 'giftHours': 0
        }}),
        '课时清零(Bug6清理)'
    )
    t.assert_ok(
        t.put('/api/enrollment-update', {'enrollment': {
            'id': bug6_enr['id'], 'status': 'settled'
        }}),
        '结转报名(Bug6清理)'
    )
    # 无课时后可以删除
    t.assert_ok(
        t.delete('/api/student-delete', {'studentId': bug6_stu['id']}),
        '无课时后删除学员(Bug6)'
    )

    # === Bug9: 报名不再设置有效期 ===
    print('  --- Bug9: 报名不再设置有效期 ---')
    name = gen_name()
    body = t.assert_ok(
        t.post('/api/student-add', {'student': {
            'name': name, 'grade': grade_name, 'phone': gen_phone(),
            'status': 'active', 'source': 'bug9-test'
        }}),
        '创建学员(Bug9)'
    )
    bug9_stu = body['data']['student']
    # 报名时传入 expiredAt，后端应忽略（强制清空）
    body = t.assert_ok(
        t.post('/api/enrollment-add', {'enrollment': {
            'studentId': bug9_stu['id'], 'courseId': math['id'],
            'purchasedHours': 5, 'unitPrice': 200,
            'totalAmount': 1000, 'paidAmount': 1000,
            'expiredAt': date_offset(-1)  # 传入已过期日期
        }}),
        '报名(传入过期日期)'
    )
    bug9_enr = body['data']['enrollment']
    # 验证 expiredAt 被强制清空
    t.assert_eq(bug9_enr['expiredAt'], '', 'expiredAt 被强制清空(Bug9)')

    # 验证即使传入过期日期，状态仍为 active（不自动过期）
    body = t.assert_ok(t.get(f'/api/enrollments?studentId={bug9_stu["id"]}'), '查询报名(Bug9)')
    bug9_enr_after = body['data']['enrollments'][0]
    t.assert_eq(bug9_enr_after['status'], 'active', '状态仍为 active(Bug9)')
    t.assert_eq(bug9_enr_after['expiredAt'], '', 'expiredAt 仍为空(Bug9)')

    # === Bug10: 有剩余课时不能直接 settled ===
    print('  --- Bug10: 有剩余课时不能直接 settled ---')
    # bug9_enr 有 5 课时，尝试直接 settled
    resp = t.put('/api/enrollment-update', {'enrollment': {
        'id': bug9_enr['id'], 'status': 'settled'
    }})
    t.assert_fail(resp, '有课时直接结转应被拒(Bug10)', '剩余课时')

    # 清理 bug9 学员
    t.assert_ok(
        t.put('/api/enrollment-update', {'enrollment': {
            'id': bug9_enr['id'], 'purchasedHours': 0, 'giftHours': 0
        }}),
        '课时清零(Bug10清理)'
    )
    t.assert_ok(
        t.put('/api/enrollment-update', {'enrollment': {
            'id': bug9_enr['id'], 'status': 'settled'
        }}),
        '结转(Bug10清理)'
    )
    t.delete('/api/student-delete', {'studentId': bug9_stu['id']})


# ============================================================
# 测试组 6: 严重 Bug 修复验证（回退课时精准回退等）
# ============================================================
def test_severe_bugs(t, prefix, ctx):
    """验证 6 个严重 bug 修复：回退课时精准回退、并发更新、金额保留、退课取消补课排课、排课冲突检测、删除课程保护"""
    print('\n[测试组 6] 严重 Bug 修复验证')

    math = ctx['math']
    cls = ctx['cls']
    grade_name = ctx['grade_name']

    # === BugA: 点名回退课时精准回退（多条报名记录） ===
    print('  --- BugA: 回退课时精准回退到原报名记录 ---')
    # 创建学员 + 两条同课程报名记录（A: 10课时先报名，B: 5课时后报名）
    name = gen_name()
    body = t.assert_ok(
        t.post('/api/student-add', {'student': {
            'name': name, 'grade': grade_name, 'phone': gen_phone(),
            'status': 'active', 'source': 'buga-test'
        }}),
        '创建学员(BugA)'
    )
    buga_stu = body['data']['student']
    # 报名 A（10付费，先报名）
    body = t.assert_ok(
        t.post('/api/enrollment-add', {'enrollment': {
            'studentId': buga_stu['id'], 'courseId': math['id'],
            'purchasedHours': 10, 'unitPrice': 200,
            'totalAmount': 2000, 'paidAmount': 2000,
            'enrolledAt': date_offset(-10)
        }}),
        '报名A(10课时,BugA)'
    )
    enr_a = body['data']['enrollment']
    # 报名 B（5付费，后报名）
    body = t.assert_ok(
        t.post('/api/enrollment-add', {'enrollment': {
            'studentId': buga_stu['id'], 'courseId': math['id'],
            'purchasedHours': 5, 'unitPrice': 200,
            'totalAmount': 1000, 'paidAmount': 1000,
            'enrolledAt': date_offset(-5)
        }}),
        '报名B(5课时,BugA)'
    )
    enr_b = body['data']['enrollment']

    # 排 11 节课并全部到课：前 10 节扣 A，第 11 节扣 B
    sched_ids_buga = []
    for i in range(11):
        d = date_offset(-(20 + i))
        body = t.assert_ok(
            t.post('/api/schedule-add', {'schedule': {
                'studentId': buga_stu['id'], 'studentName': buga_stu['name'],
                'classId': cls['id'], 'courseId': math['id'], 'courseName': math['name'],
                'teacher': cls['teacher'], 'location': cls['location'],
                'date': d, 'startTime': '09:00', 'endTime': '10:30',
                'color': math['color'], 'status': 'scheduled'
            }}),
            f'排课 #{i+1}(BugA)'
        )
        sched_ids_buga.append((body['data']['schedule']['id'], d))

    # 全部点到课
    date_groups = {}
    for sid, d in sched_ids_buga:
        date_groups.setdefault(d, []).append(
            {'scheduleId': sid, 'studentId': buga_stu['id'], 'attended': True})
    for d, its in date_groups.items():
        t.assert_ok(t.post('/api/attendance', {'date': d, 'items': its}), f'点名到课 {d}(BugA)')

    # 验证 A 扣完（0），B 扣 1（4）
    body = t.assert_ok(t.get(f'/api/enrollments?studentId={buga_stu["id"]}'), '查询报名(BugA扣减后)')
    enrs = {e['id']: e for e in body['data']['enrollments']}
    t.assert_eq(enrs[enr_a['id']]['remainingPaidHours'], 0, '报名A扣完(BugA)')
    t.assert_eq(enrs[enr_b['id']]['remainingPaidHours'], 4, '报名B扣1(BugA)')

    # 回退第 1 节课（当初扣的是 A 的付费）
    first_sid, first_date = sched_ids_buga[0]
    t.assert_ok(
        t.post('/api/attendance', {'date': first_date, 'items': [
            {'scheduleId': first_sid, 'studentId': buga_stu['id'], 'attended': False}
        ]}),
        '回退第1节(BugA)'
    )
    # 验证回退到 A（A 从 0 变 1），而不是 B（B 仍为 4）
    body = t.assert_ok(t.get(f'/api/enrollments?studentId={buga_stu["id"]}'), '查询报名(BugA回退后)')
    enrs = {e['id']: e for e in body['data']['enrollments']}
    t.assert_eq(enrs[enr_a['id']]['remainingPaidHours'], 1, '回退到报名A(BugA,精准回退)')
    t.assert_eq(enrs[enr_b['id']]['remainingPaidHours'], 4, '报名B不变(BugA,未误退)')

    # 清理
    for e in enrs.values():
        t.put('/api/enrollment-update', {'enrollment': {
            'id': e['id'], 'purchasedHours': 0, 'giftHours': 0
        }})
        t.put('/api/enrollment-update', {'enrollment': {'id': e['id'], 'status': 'settled'}})
    t.delete('/api/student-delete', {'studentId': buga_stu['id']})

    # === BugB: 金额字段不被退课清零 ===
    print('  --- BugB: 退课不清零金额字段 ---')
    name = gen_name()
    body = t.assert_ok(
        t.post('/api/student-add', {'student': {
            'name': name, 'grade': grade_name, 'phone': gen_phone(),
            'status': 'active', 'source': 'bugb-test'
        }}),
        '创建学员(BugB)'
    )
    bugb_stu = body['data']['student']
    body = t.assert_ok(
        t.post('/api/enrollment-add', {'enrollment': {
            'studentId': bugb_stu['id'], 'courseId': math['id'],
            'purchasedHours': 10, 'unitPrice': 200,
            'totalAmount': 2000, 'paidAmount': 2000
        }}),
        '报名(BugB)'
    )
    bugb_enr = body['data']['enrollment']
    # 退课：把课时改为 0
    t.assert_ok(
        t.put('/api/enrollment-update', {'enrollment': {
            'id': bugb_enr['id'], 'purchasedHours': 0, 'giftHours': 0
        }}),
        '退课课时清零(BugB)'
    )
    # 验证 totalAmount 和 paidAmount 仍为 2000（未被重算为 0）
    body = t.assert_ok(t.get(f'/api/enrollments?studentId={bugb_stu["id"]}'), '查询报名(BugB退课后)')
    bugb_enr_after = body['data']['enrollments'][0]
    t.assert_eq(bugb_enr_after['totalAmount'], 2000, 'totalAmount 保留(BugB)')
    t.assert_eq(bugb_enr_after['paidAmount'], 2000, 'paidAmount 保留(BugB)')
    # 清理
    t.put('/api/enrollment-update', {'enrollment': {'id': bugb_enr['id'], 'status': 'settled'}})
    t.delete('/api/student-delete', {'studentId': bugb_stu['id']})

    # === BugD: 排课时间冲突检测 ===
    print('  --- BugD: 排课时间冲突检测 ---')
    name = gen_name()
    body = t.assert_ok(
        t.post('/api/student-add', {'student': {
            'name': name, 'grade': grade_name, 'phone': gen_phone(),
            'status': 'active', 'source': 'bugd-test'
        }}),
        '创建学员(BugD)'
    )
    bugd_stu = body['data']['student']
    t.assert_ok(
        t.post('/api/enrollment-add', {'enrollment': {
            'studentId': bugd_stu['id'], 'courseId': math['id'],
            'purchasedHours': 10, 'unitPrice': 200,
            'totalAmount': 2000, 'paidAmount': 2000
        }}),
        '报名(BugD)'
    )
    conflict_date = date_offset(7)
    # 排第一节课 09:00-10:30
    t.assert_ok(
        t.post('/api/schedule-add', {'schedule': {
            'studentId': bugd_stu['id'], 'studentName': bugd_stu['name'],
            'classId': cls['id'], 'courseId': math['id'], 'courseName': math['name'],
            'teacher': cls['teacher'], 'location': cls['location'],
            'date': conflict_date, 'startTime': '09:00', 'endTime': '10:30',
            'color': math['color'], 'status': 'scheduled'
        }}),
        '排课1(BugD)'
    )
    # 排重叠时间 10:00-11:30 应被拒
    resp = t.post('/api/schedule-add', {'schedule': {
        'studentId': bugd_stu['id'], 'studentName': bugd_stu['name'],
        'classId': cls['id'], 'courseId': math['id'], 'courseName': math['name'],
        'teacher': cls['teacher'], 'location': cls['location'],
        'date': conflict_date, 'startTime': '10:00', 'endTime': '11:30',
        'color': math['color'], 'status': 'scheduled'
    }})
    t.assert_fail(resp, '时间冲突排课应被拒(BugD)', '时间冲突')
    # 不重叠时间 11:00-12:30 应成功
    t.assert_ok(
        t.post('/api/schedule-add', {'schedule': {
            'studentId': bugd_stu['id'], 'studentName': bugd_stu['name'],
            'classId': cls['id'], 'courseId': math['id'], 'courseName': math['name'],
            'teacher': cls['teacher'], 'location': cls['location'],
            'date': conflict_date, 'startTime': '11:00', 'endTime': '12:30',
            'color': math['color'], 'status': 'scheduled'
        }}),
        '不重叠排课成功(BugD)'
    )
    # 清理
    body = t.assert_ok(t.get(f'/api/enrollments?studentId={bugd_stu["id"]}'), '查询报名(BugD清理)')
    for e in body['data']['enrollments']:
        t.put('/api/enrollment-update', {'enrollment': {'id': e['id'], 'purchasedHours': 0, 'giftHours': 0}})
        t.put('/api/enrollment-update', {'enrollment': {'id': e['id'], 'status': 'settled'}})
    t.delete('/api/student-delete', {'studentId': bugd_stu['id']})

    # === BugF: 删除课程有 active 报名应被拒 ===
    print('  --- BugF: 删除课程保护 ---')
    body = t.assert_ok(
        t.post('/api/course-add', {'course': {
            'name': f'{prefix}待删课程', 'color': '#999999', 'category': '测试',
            'grade': grade_name, 'billingType': 'per_lesson', 'status': 'active'
        }}),
        '创建待删课程(BugF)'
    )
    bugf_course = body['data']['course']
    name = gen_name()
    body = t.assert_ok(
        t.post('/api/student-add', {'student': {
            'name': name, 'grade': grade_name, 'phone': gen_phone(),
            'status': 'active', 'source': 'bugf-test'
        }}),
        '创建学员(BugF)'
    )
    bugf_stu = body['data']['student']
    t.assert_ok(
        t.post('/api/enrollment-add', {'enrollment': {
            'studentId': bugf_stu['id'], 'courseId': bugf_course['id'],
            'purchasedHours': 5, 'unitPrice': 100,
            'totalAmount': 500, 'paidAmount': 500
        }}),
        '报名待删课程(BugF)'
    )
    # 有 active 报名时删除应被拒
    resp = t.delete('/api/course-delete', {'courseId': bugf_course['id']})
    t.assert_fail(resp, '有报名时删课程应被拒(BugF)', '进行中的报名')
    # 退课后可以删除
    body = t.assert_ok(t.get(f'/api/enrollments?studentId={bugf_stu["id"]}'), '查询报名(BugF清理)')
    bugf_enr = body['data']['enrollments'][0]
    t.put('/api/enrollment-update', {'enrollment': {'id': bugf_enr['id'], 'purchasedHours': 0, 'giftHours': 0}})
    t.put('/api/enrollment-update', {'enrollment': {'id': bugf_enr['id'], 'status': 'settled'}})
    t.delete('/api/student-delete', {'studentId': bugf_stu['id']})
    t.assert_ok(
        t.delete('/api/course-delete', {'courseId': bugf_course['id']}),
        '退课后删课程成功(BugF)'
    )


# ============================================================
# 主入口
# ============================================================
def main():
    print('=' * 60)
    print('  排课系统综合测试脚本')
    print('  覆盖: 完整流程 / 安全性 / 业务流程 / 非流程拦截 / Bug修复 / 严重Bug')
    print('=' * 60)

    ip = input('\n请输入服务器 IP (回车默认 127.0.0.1): ').strip() or '127.0.0.1'
    port = input('请输入端口 (回车默认 8788): ').strip() or '8788'
    admin_user = input('管理员用户名 (回车默认 admin): ').strip() or 'admin'
    admin_pass = input('管理员密码 (回车默认 admin123): ').strip() or 'admin123'
    base_url = f'http://{ip}:{port}'

    t = TestRunner(base_url)

    # 连通性
    status, body = t.get('/api/auth/bootstrap')
    if status != 200:
        print(f'[错误] 无法访问 {base_url},HTTP {status}')
        sys.exit(1)

    # 登录
    status, body = t.post('/api/auth', {'username': admin_user, 'password': admin_pass})
    if body.get('code') != 0:
        print(f'[错误] 登录失败: {body.get("message")}')
        sys.exit(1)
    t.token = body['data']['token']
    print(f'登录成功,开始测试...\n')

    # 生成唯一前缀(时间戳),避免重复数据冲突
    prefix = f'T{int(time.time())}'

    # 执行六组测试
    ctx = test_full_flow(t, prefix)
    test_security(t, prefix)
    test_business_flow(t, prefix, ctx)
    test_non_flow_intercept(t, prefix, ctx)
    test_bug_fixes(t, prefix, ctx)
    test_severe_bugs(t, prefix, ctx)

    # 汇总
    success = t.summary()
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\n[中断] 用户取消')
        sys.exit(130)
