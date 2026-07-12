#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""干净验证补课点名扣课时"""
import json
import datetime
import urllib.request

BASE = 'http://127.0.0.1:8788'

def req(method, path, body=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    data = json.dumps(body).encode() if body else None
    r = urllib.request.Request(f'{BASE}{path}', data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode())

token = req('POST', '/api/auth', {'username': 'admin', 'password': 'admin123'})['data']['token']

grades = req('GET', '/api/grades', token=token)['data']['grades']
courses = req('GET', '/api/courses', token=token)['data']['courses']
classes = req('GET', '/api/classes', token=token)['data']['classes']

math = next(c for c in courses if c['name'] == '数学思维')
english = next(c for c in courses if c['name'] == '英语启蒙')
math_class = next(c for c in classes if c['courseId'] == math['id'])
english_class = next(c for c in classes if c['courseId'] == english['id'])
grade_name = grades[0]['name']

# 学员
stu = req('POST', '/api/student-add', {'student': {
    'name': '补课验证员', 'grade': grade_name, 'phone': '13900000888',
    'status': 'active', 'tags': '测试', 'source': 'test'
}}, token=token)['data']['student']

# 报名数学 10 课时
req('POST', '/api/enrollment-add', {'enrollment': {
    'studentId': stu['id'], 'courseId': math['id'],
    'purchasedHours': 10, 'giftHours': 0, 'unitPrice': 200,
    'totalAmount': 2000, 'paidAmount': 2000, 'note': ''
}}, token=token)

def get_math_hours():
    enrs = req('GET', f'/api/enrollments?studentId={stu["id"]}', token=token)['data']['enrollments']
    return next(e['remainingPaidHours'] for e in enrs if e['courseId'] == math['id'])

print(f'[初始] 数学剩余课时: {get_math_hours()}')

# 排数学课(昨天)
yesterday = (datetime.date.today() + datetime.timedelta(days=-1)).strftime('%Y-%m-%d')
tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).strftime('%Y-%m-%d')
req('POST', '/api/schedule-add', {'schedule': {
    'studentId': stu['id'], 'studentName': stu['name'],
    'classId': math_class['id'], 'courseId': math['id'], 'courseName': math['name'],
    'teacher': math_class['teacher'], 'location': math_class['location'],
    'date': yesterday, 'startTime': '09:00', 'endTime': '10:30',
    'color': math['color'], 'status': 'scheduled'
}}, token=token)

# 查原排课 ID
att_list = req('GET', f'/api/attendance?date={yesterday}', token=token)
sched1 = next(s for s in att_list['data']['schedules'] if s['studentId'] == stu['id'])
print(f'[排课] 原排课 {sched1["id"]}, attended={sched1.get("attended")}')

# 步骤A: 标记数学缺勤(应保持 10 课时,因为 undefined→false 不该扣也不该加)
att1 = req('POST', '/api/attendance', {'date': yesterday, 'items': [
    {'scheduleId': sched1['id'], 'studentId': stu['id'], 'attended': False}
]}, token=token)
print(f'[点名缺勤] updated={att1["data"]["updatedSchedules"]}, errors={att1["data"].get("errors",[])}')
print(f'[缺勤后] 数学剩余课时: {get_math_hours()}')

# 步骤B: 插班补课到英语班
makeup = req('POST', '/api/schedule-makeup', {
    'scheduleId': sched1['id'], 'newDate': tomorrow, 'newStartTime': '10:00', 'newEndTime': '11:30',
    'newClassId': english_class['id'], 'newCourseId': english['id'],
    'newCourseName': english['name'], 'newTeacher': english_class['teacher'],
    'newLocation': english_class['location'], 'newColor': english['color'],
    'reason': '插班补课'
}, token=token)
new_sched_id = makeup['data']['newScheduleId']
print(f'[补课] 新排课 {new_sched_id}')

# 步骤C: 补课点名到课
att2 = req('POST', '/api/attendance', {'date': tomorrow, 'items': [
    {'scheduleId': new_sched_id, 'studentId': stu['id'], 'attended': True}
]}, token=token)
print(f'[补课到课] updated={att2["data"]["updatedSchedules"]}, errors={att2["data"].get("errors",[])}')
final_hours = get_math_hours()
print(f'[到课后] 数学剩余课时: {final_hours}')

if final_hours == 9:
    print('\n✅ 验证通过: 插班补课到英语班,数学课课时正确扣减(10→9)')
else:
    print(f'\n❌ 验证失败: 数学课剩余课时 = {final_hours}(期望 9)')
