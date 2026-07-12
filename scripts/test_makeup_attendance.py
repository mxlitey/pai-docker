#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""验证插班补课点名扣课时逻辑"""
import json
import urllib.request

BASE = 'http://127.0.0.1:8788'

def req(method, path, body=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    data = json.dumps(body).encode() if body else None
    r = urllib.request.Request(f'{BASE}{path}', data=data, headers=headers, method=method)
    with urllib.request.urlopen(r) as resp:
        return json.loads(resp.read().decode())

# 登录
token = req('POST', '/api/auth', {'username': 'admin', 'password': 'admin123'})['data']['token']

# 1. 取已存在的年级/课程/班级
grades = req('GET', '/api/grades', token=token)['data']['grades']
courses = req('GET', '/api/courses', token=token)['data']['courses']
classes = req('GET', '/api/classes', token=token)['data']['classes']

math = next(c for c in courses if c['name'] == '数学思维')
english = next(c for c in courses if c['name'] == '英语启蒙')
math_class = next(c for c in classes if c['courseId'] == math['id'])
english_class = next(c for c in classes if c['courseId'] == english['id'])
grade_name = grades[0]['name']

print(f'数学课: {math["id"]} / 班级: {math_class["id"]}')
print(f'英语课: {english["id"]} / 班级: {english_class["id"]}')

# 2. 创建学员
stu = req('POST', '/api/student-add', {'student': {
    'name': '补课测试员', 'grade': grade_name, 'phone': '13900000999',
    'status': 'active', 'tags': '测试', 'source': 'makeup-test'
}}, token=token)['data']['student']
print(f'学员: {stu["id"]} ({stu["name"]})')

# 3. 只报名数学课(10 课时)
enr_resp = req('POST', '/api/enrollment-add', {'enrollment': {
    'studentId': stu['id'], 'courseId': math['id'],
    'purchasedHours': 10, 'giftHours': 0, 'unitPrice': 200,
    'totalAmount': 2000, 'paidAmount': 2000, 'note': '补课测试报名'
}}, token=token)
enr = enr_resp['data']['enrollment']
# 用 GET 接口重新拉取完整字段
enr = req('GET', f'/api/enrollments?studentId={stu["id"]}', token=token)['data']['enrollments'][0]
print(f'报名数学: {enr["id"]}, 剩余课时 = {enr["remainingPaidHours"]}')

# 4. 排数学课(昨天)
import datetime
yesterday = (datetime.date.today() + datetime.timedelta(days=-1)).strftime('%Y-%m-%d')
tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).strftime('%Y-%m-%d')
sched1_resp = req('POST', '/api/schedule-add', {'schedule': {
    'studentId': stu['id'], 'studentName': stu['name'],
    'classId': math_class['id'], 'courseId': math['id'], 'courseName': math['name'],
    'teacher': math_class['teacher'], 'location': math_class['location'],
    'date': yesterday, 'startTime': '09:00', 'endTime': '10:30',
    'color': math['color'], 'status': 'scheduled'
}}, token=token)
# 用 attendance GET 查回完整排课对象
att_list = req('GET', f'/api/attendance?date={yesterday}', token=token)
sched1 = next(s for s in att_list['data']['schedules'] if s['studentId'] == stu['id'])
print(f'原排课(数学): {sched1["id"]}, 日期 {sched1["date"]}')

# 5. 点名: 标记数学缺勤
att1 = req('POST', '/api/attendance', {'date': yesterday, 'items': [
    {'scheduleId': sched1['id'], 'studentId': stu['id'], 'attended': False}
]}, token=token)
print(f'数学点名缺勤: updated={att1["data"]["updatedSchedules"]}')

# 6. 插班补课: 补到英语班(学员没报名英语)
makeup = req('POST', '/api/schedule-makeup', {
    'scheduleId': sched1['id'], 'newDate': tomorrow, 'newStartTime': '10:00', 'newEndTime': '11:30',
    'newClassId': english_class['id'], 'newCourseId': english['id'],
    'newCourseName': english['name'], 'newTeacher': english_class['teacher'],
    'newLocation': english_class['location'], 'newColor': english['color'],
    'reason': '插班补课到英语班'
}, token=token)
print(f'补课结果: {makeup["code"]} - {makeup["message"]}')
new_sched_id = makeup['data']['newScheduleId']

# 7. 查看新排课
new_sched = None
# 通过 attendance 接口查明天排课
att_list = req('GET', f'/api/attendance?date={tomorrow}', token=token)
for s in att_list['data']['schedules']:
    if s['id'] == new_sched_id:
        new_sched = s
        break
print(f'补课新排课: course={new_sched["courseName"]}, makeupFor={new_sched.get("makeupFor","")}')

# 8. 点名补课: 到课
att2 = req('POST', '/api/attendance', {'date': tomorrow, 'items': [
    {'scheduleId': new_sched_id, 'studentId': stu['id'], 'attended': True}
]}, token=token)
print(f'补课点名到课: updated={att2["data"]["updatedSchedules"]}, errors={att2["data"].get("errors",[])}')

# 9. 检查数学报名的剩余课时(应从 10 减到 9)
enr_after = req('GET', f'/api/enrollments?studentId={stu["id"]}', token=token)['data']['enrollments']
for e in enr_after:
    # 通过 courseId 匹配课程名
    cn = next((c['name'] for c in courses if c['id'] == e['courseId']), e['courseId'])
    print(f'报名记录: 课程={cn}, 剩余付费={e["remainingPaidHours"]}, 剩余赠课={e["remainingGiftHours"]}')

# 结论
math_enr = next(e for e in enr_after if e['courseId'] == math['id'])
if math_enr['remainingPaidHours'] == 9:
    print('\n✅ 验证通过: 插班补课到英语班,但数学课课时正确扣减(10→9)')
else:
    print(f'\n❌ 验证失败: 数学课剩余课时 = {math_enr["remainingPaidHours"]}(期望 9)')
