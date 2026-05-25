-- =============================================
-- Seed: Subjects (วิชาหลักในระบบไทย)
-- =============================================
INSERT INTO public.subjects (id, name, name_en, category, sort_order, is_active) VALUES
  (gen_random_uuid(), 'คณิตศาสตร์', 'Mathematics', 'math', 1, true),
  (gen_random_uuid(), 'วิทยาศาสตร์', 'Science', 'science', 2, true),
  (gen_random_uuid(), 'ภาษาอังกฤษ', 'English', 'language', 3, true),
  (gen_random_uuid(), 'ภาษาไทย', 'Thai', 'language', 4, true),
  (gen_random_uuid(), 'สังคมศึกษา', 'Social Studies', 'social', 5, true),
  (gen_random_uuid(), 'ฟิสิกส์', 'Physics', 'science', 6, true),
  (gen_random_uuid(), 'เคมี', 'Chemistry', 'science', 7, true),
  (gen_random_uuid(), 'ชีววิทยา', 'Biology', 'science', 8, true),
  (gen_random_uuid(), 'คอมพิวเตอร์', 'Computer Science', 'other', 9, true),
  (gen_random_uuid(), 'TGAT', 'TGAT', 'test_prep', 10, true),
  (gen_random_uuid(), 'A-Level', 'A-Level', 'test_prep', 11, true),
  (gen_random_uuid(), 'O-NET', 'O-NET', 'test_prep', 12, true),
  (gen_random_uuid(), 'สอบเข้า ม.ปลาย', 'High School Entrance', 'test_prep', 13, true),
  (gen_random_uuid(), 'ปรับพื้นฐาน', 'Remedial', 'other', 14, true),
  (gen_random_uuid(), 'อื่นๆ', 'Other', 'other', 99, true);
