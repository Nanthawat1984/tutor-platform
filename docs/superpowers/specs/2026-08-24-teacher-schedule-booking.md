# Teacher Schedule-Based Booking Spec

## Goal

ผู้ปกครองต้องจองได้เฉพาะวันและเวลาที่ครูกำหนดไว้ในตารางสอน และระบบต้องยืนยัน availability ซ้ำฝั่ง server ก่อนสร้าง booking

## Requirements

- หน้าจองต้องไม่เปิดช่องวัน/เวลาแบบอิสระ
- แสดงเฉพาะ slot ที่สร้างจากตารางครู active ภายในช่วงวันที่ใช้งาน
- slot ต้องสอดคล้องกับระยะเวลาของคอร์ส
- ซ่อน slot ที่ชนกับ booking สถานะ `pending` หรือ `confirmed` ของครู
- server ต้องตรวจ course, schedule, วันที่, เวลา, ระยะเวลา และ conflict ซ้ำก่อนเขียนข้อมูล
- การตรวจ conflict ต้องอยู่ใน Firestore transaction เพื่อป้องกัน concurrent booking
- รองรับ schedule เดิมที่เก็บ `start_date`/`end_date` และรายการใหม่ที่ใช้ `startDate`/`endDate`
- หากไม่มี slot ให้แสดงสถานะที่เข้าใจได้และไม่ให้ submit booking
- ไม่แก้หรือลบข้อมูล booking เดิม

## Acceptance Criteria

- parent ไม่สามารถส่งค่า `booking_date`, `start_time`, `end_time` ที่ไม่ตรงกับตารางครูแล้วสร้าง booking ได้
- parent เลือก slot ที่ตรงกับตารางครูและยังไม่ชนได้สำเร็จ
- การจองซ้อนกันถูกปฏิเสธด้วยสถานะ conflict ที่ user-facing เข้าใจได้
- unit tests, typecheck และ production build ผ่าน
