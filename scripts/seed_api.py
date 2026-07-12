#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
排课系统 HTTP API 测试脚本
================================
运行时输入目标服务器 IP 和端口,通过 HTTP API 自动写入演示数据:
  8 个年级 / 10 门课程 / 20 个班级 / 100 名学员 / 报名 / 排课 / 点名
姓名使用百家姓 + 随机 1-2 字名字。

用法:
  python3 scripts/seed_api.py
依赖: 仅 Python 标准库(urllib),无需 pip install
"""
import json
import random
import sys
from datetime import date, timedelta
from urllib import request as urlreq
from urllib.error import HTTPError, URLError


# ============================================================
# 数据池:百家姓 + 名字用字
# ============================================================
# 百家姓(常见 120 个,去重保序)
SURNAMES = list('赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜'
                '戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐'
                '费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平'
                '黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝'
                '董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊')

# 名字常用字(单字或双字组合)
GIVEN_CHARS = list(
    '伟芳娜敏静丽强磊军洋勇艳杰娟涛明超霞平刚桂英秀兰建国建华志强'
    '宇航梓涵雨萱子轩若曦浩然思琪嘉怡博文皓宇诗涵梦琪俊杰天宇心怡'
    '鑫磊晓晨晨曦子涵雨欣浩宇欣怡思源明轩雨泽宇航子萱晨阳子墨若华'
    '瑞雪清扬沐辰璟雯煜城芷晴言溪韵秋锦书望舒听莲南风知意照雪轻舟'
)

# 年级
GRADE_NAMES = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '初一', '初二']

# 课程定义(10 门,带颜色/类别/年级)
COURSE_DEFS = [
    {'name': '数学思维', 'color': '#3b82f6', 'category': '理科', 'grade': '三年级'},
    {'name': '英语启蒙', 'color': '#ef4444', 'category': '语言', 'grade': '一年级'},
    {'name': '物理竞赛', 'color': '#8b5cf6', 'category': '理科', 'grade': '初二'},
    {'name': '语文阅读', 'color': '#10b981', 'category': '语言', 'grade': '五年级'},
    {'name': '化学基础', 'color': '#f59e0b', 'category': '理科', 'grade': '初二'},
    {'name': '编程入门', 'color': '#06b6d4', 'category': '科技', 'grade': '六年级'},
    {'name': '英语口语', 'color': '#ec4899', 'category': '语言', 'grade': '四年级'},
    {'name': '奥数精讲', 'color': '#6366f1', 'category': '理科', 'grade': '六年级'},
    {'name': '美术创意', 'color': '#84cc16', 'category': '艺术', 'grade': '二年级'},
    {'name': '历史故事', 'color': '#a855f7', 'category': '人文', 'grade': '初一'},
]

TEACHERS = ['王老师', '李老师', '张老师', '刘老师', '陈老师', '杨老师', '赵老师', '黄老师']
LOCATIONS = ['1号教室', '2号教室', '3号教室', '4号教室', '多功能厅', '实验室', '美术室', '机房']
TIME_SLOTS = [
    ('08:00', '09:30'), ('10:00', '11:30'), ('14:00', '15:30'),
    ('16:00', '17:30'), ('19:00', '20:30'),
]


# ============================================================
# HTTP 工具
# ============================================================
class ApiClient:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip('/')
        self.token = None

    def _headers(self):
        h = {'Content-Type': 'application/json; charset=utf-8'}
        if self.token:
            h['Authorization'] = f'Bearer {self.token}'
        return h

    def request(self, method, path, body=None):
        url = f'{self.base_url}{path}'
        data = json.dumps(body).encode('utf-8') if body is not None else None
        req = urlreq.Request(url, data=data, headers=self._headers(), method=method)
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
            print(f'[错误] 无法连接 {url}: {e.reason}')
            sys.exit(1)

    def get(self, path):
        return self.request('GET', path)

    def post(self, path, body):
        return self.request('POST', path, body)


# ============================================================
# 工具函数
# ============================================================
def gen_name():
    """百家姓 + 随机 1-2 字名字"""
    surname = random.choice(SURNAMES)
    given_len = random.randint(1, 2)
    given = ''.join(random.sample(GIVEN_CHARS, given_len))
    return surname + given


def gen_phone():
    return '138' + ''.join(random.choice('0123456789') for _ in range(8))


def date_offset(days):
    d = date.today() + timedelta(days=days)
    return d.strftime('%Y-%m-%d')


def must_ok(resp, label):
    """校验响应 code==0,失败则抛异常退出"""
    status, body = resp
    code = body.get('code')
    if code != 0:
        msg = body.get('message') or body
        print(f'[失败] {label}: HTTP {status} -> {msg}')
        sys.exit(1)
    return body


# ============================================================
# 主流程
# ============================================================
def main():
    print('=' * 60)
    print('  排课系统 HTTP API 测试脚本')
    print('  写入: 8 年级 / 10 课程 / 20 班级 / 100 学员 + 报名 + 排课 + 点名')
    print('=' * 60)

    # 1. 输入目标地址
    ip = input('\n请输入服务器 IP (回车默认 127.0.0.1): ').strip() or '127.0.0.1'
    port = input('请输入端口 (回车默认 8788): ').strip() or '8788'
    base_url = f'http://{ip}:{port}'
    print(f'\n目标地址: {base_url}')

    client = ApiClient(base_url)

    # 2. 连通性测试
    print('\n[1/10] 测试连通性...')
    status, body = client.get('/api/auth/bootstrap')
    if status != 200:
        print(f'[错误] 无法访问 {base_url}/api/auth/bootstrap (HTTP {status})')
        sys.exit(1)
    bootstrap = body.get('data', {}).get('bootstrap', True)
    print(f'  系统初始化状态: {"未初始化" if bootstrap else "已初始化"}')

    # 3. 超管账号 / 登录
    admin_user = input('\n请输入管理员用户名 (回车默认 admin): ').strip() or 'admin'
    admin_pass = input('请输入管理员密码 (回车默认 admin123): ').strip() or 'admin123'

    if bootstrap:
        print(f'\n[2/10] 系统未初始化,创建超管账号 {admin_user} ...')
        must_ok(
            client.post('/api/auth/bootstrap', {
                'username': admin_user,
                'password': admin_pass,
                'confirmPassword': admin_pass,
            }),
            '创建超管账号'
        )
        print(f'  超管账号创建成功: {admin_user}')
    else:
        print(f'\n[2/10] 系统已初始化,跳过创建超管')

    # 登录
    print(f'  登录中...')
    body = must_ok(
        client.post('/api/auth', {'username': admin_user, 'password': admin_pass}),
        '登录'
    )
    client.token = body['data']['token']
    print(f'  登录成功,token 已获取')

    # 4. 年级
    print('\n[3/10] 创建 8 个年级...')
    grade_ids = []
    for i, name in enumerate(GRADE_NAMES):
        body = must_ok(
            client.post('/api/grade-add', {'grade': {
                'name': name, 'sortOrder': i, 'status': 'active', 'description': ''
            }}),
            f'创建年级 {name}'
        )
        grade_ids.append(body['data']['grade']['id'])
    print(f'  完成: {len(grade_ids)} 个年级')

    # 5. 课程
    print('\n[4/10] 创建 10 门课程...')
    courses = []
    for c in COURSE_DEFS:
        body = must_ok(
            client.post('/api/course-add', {'course': {
                'name': c['name'], 'color': c['color'], 'category': c['category'],
                'grade': c['grade'], 'billingType': 'per_lesson', 'term': '2026春季',
                'status': 'active', 'description': f"{c['name']}课程"
            }}),
            f"创建课程 {c['name']}"
        )
        courses.append(body['data']['course'])
    print(f'  完成: {len(courses)} 门课程')

    # 6. 班级
    print('\n[5/10] 创建 20 个班级...')
    classes = []
    for i in range(20):
        course = courses[i % len(courses)]
        teacher = TEACHERS[i % len(TEACHERS)]
        location = LOCATIONS[i % len(LOCATIONS)]
        s, e = TIME_SLOTS[i % len(TIME_SLOTS)]
        cls_name = f"{course['name']}-{teacher}-{i + 1}班"
        body = must_ok(
            client.post('/api/class-add', {'class': {
                'name': cls_name, 'courseId': course['id'], 'grade': course['grade'],
                'teacher': teacher, 'location': location, 'color': course['color'],
                'defaultStartTime': s, 'defaultEndTime': e,
                'capacity': 25, 'status': 'active', 'remark': ''
            }}),
            f'创建班级 {cls_name}'
        )
        classes.append(body['data']['class'])
    print(f'  完成: {len(classes)} 个班级')

    # 7. 学员(百家姓 + 随机 1-2 字名)
    print('\n[6/10] 创建 100 名学员(百家姓 + 随机名)...')
    students = []
    for i in range(100):
        name = gen_name()
        grade = random.choice(GRADE_NAMES)
        body = must_ok(
            client.post('/api/student-add', {'student': {
                'name': name, 'grade': grade, 'phone': gen_phone(),
                'parentName': f'{random.choice(SURNAMES)}先生/女士',
                'gender': random.choice(['男', '女']),
                'birthday': f"{2010 + random.randint(0, 7)}-{random.randint(1, 12):02d}-{random.randint(1, 28):02d}",
                'status': 'active', 'tags': 'API测试', 'remark': 'API脚本写入', 'source': 'api-test'
            }}),
            f'创建学员 {name}({i + 1}/100)'
        )
        students.append(body['data']['student'])
        if (i + 1) % 20 == 0:
            print(f'  进度: {i + 1}/100')
    print(f'  完成: {len(students)} 名学员')

    # 8. 报名(每名学员随机 1-2 门课程)
    print('\n[7/10] 创建报名记录...')
    enroll_count = 0
    stu_courses = {}  # {studentId: [course, ...]} 供排课使用
    for stu in students:
        course_count = random.randint(1, 2)
        chosen = random.sample(courses, course_count)
        stu_courses[stu['id']] = chosen
        for course in chosen:
            purchased = random.choice([10, 20, 30, 48, 50])
            gift = random.choice([0, 0, 0, 2, 5])
            unit_price = random.choice([100, 150, 200, 250, 300])
            total = purchased * unit_price
            paid = total if random.random() < 0.8 else round(total * 0.9, 2)
            body = must_ok(
                client.post('/api/enrollment-add', {'enrollment': {
                    'studentId': stu['id'], 'courseId': course['id'],
                    'purchasedHours': purchased, 'giftHours': gift,
                    'unitPrice': unit_price, 'totalAmount': total, 'paidAmount': paid,
                    'expiredAt': date_offset(180),
                    'enrolledAt': date_offset(-random.randint(0, 60)),
                    'note': ''
                }}),
                f"报名 {stu['name']} -> {course['name']}"
            )
            enroll_count += 1
    print(f'  完成: {enroll_count} 条报名')

    # 9. 排课(每名学员 2-4 节课,从已报名课程中选择)
    print('\n[8/10] 创建排课...')
    sched_count = 0
    for stu in students:
        enrolled = stu_courses.get(stu['id'], [])
        if not enrolled:
            continue
        count = random.randint(2, 4)
        for j in range(count):
            course = random.choice(enrolled)
            cls = next((c for c in classes if c['courseId'] == course['id']), classes[0])
            s, e = random.choice(TIME_SLOTS)
            body = must_ok(
                client.post('/api/schedule-add', {'schedule': {
                    'studentId': stu['id'], 'studentName': stu['name'],
                    'classId': cls['id'], 'courseId': course['id'], 'courseName': course['name'],
                    'teacher': cls['teacher'], 'location': cls['location'],
                    'date': date_offset(random.randint(-30, 30)),
                    'startTime': s, 'endTime': e,
                    'color': course['color'], 'status': 'scheduled', 'note': ''
                }}),
                f"排课 {stu['name']} {course['name']}"
            )
            sched_count += 1
    print(f'  完成: {sched_count} 条排课')

    # 10. 点名(对过去日期的排课批量标记出勤)
    print('\n[9/10] 查询历史排课并点名...')
    # 用 attendance GET 接口按日期拉取过去 7 天的排课,再批量点名
    attend_count = 0
    for d_off in range(-7, 0):
        d = date_offset(d_off)
        status, body = client.get(f'/api/attendance?date={d}')
        if status != 200 or body.get('code') != 0:
            continue
        schedules = body.get('data', {}).get('schedules', [])
        if not schedules:
            continue
        items = []
        for s in schedules:
            if s.get('attended') is None:
                items.append({
                    'scheduleId': s['id'],
                    'studentId': s['studentId'],
                    'attended': random.random() < 0.85,
                })
        if not items:
            continue
        must_ok(
            client.post('/api/attendance', {'date': d, 'items': items}),
            f'点名 {d}'
        )
        attend_count += len(items)
    print(f'  完成: {attend_count} 条点名')

    # 11. 公告
    print('\n[10/10] 写入公告...')
    # announcement API: 先看是否存在,直接 PUT/POST
    status, body = client.get('/api/announcement')
    content = ('欢迎使用排课系统!本数据由 Python API 测试脚本写入:\n'
               '- 8 个年级 / 10 门课程 / 20 个班级 / 100 名学员\n'
               f'- {enroll_count} 条报名 / {sched_count} 条排课 / {attend_count} 条点名\n'
               '姓名采用百家姓 + 随机 1-2 字名字生成。')
    # announcement 接口: POST 更新
    must_ok(
        client.post('/api/announcement', {'content': content}),
        '写入公告'
    )
    print('  公告已写入')

    # 汇总
    print('\n' + '=' * 60)
    print('  数据写入完成!')
    print('=' * 60)
    print(f'  年级:   {len(grade_ids)} 个')
    print(f'  课程:   {len(courses)} 门')
    print(f'  班级:   {len(classes)} 个')
    print(f'  学员:   {len(students)} 名')
    print(f'  报名:   {enroll_count} 条')
    print(f'  排课:   {sched_count} 条')
    print(f'  点名:   {attend_count} 条')
    print(f'\n  登录账号: {admin_user} / {admin_pass}')
    print(f'  访问地址: {base_url}')
    print('=' * 60)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\n[中断] 用户取消')
        sys.exit(130)
