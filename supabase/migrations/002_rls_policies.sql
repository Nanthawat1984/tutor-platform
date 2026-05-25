-- =============================================
-- Tutor Platform MVP — Row Level Security Policies
-- =============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's role
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS boolean AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'teacher');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- =============================================
-- PROFILES
-- =============================================
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Public can view teacher profiles" ON public.profiles
  FOR SELECT USING (role = 'teacher');

-- =============================================
-- TEACHER PROFILES
-- =============================================
CREATE POLICY "Public can view active teacher profiles" ON public.teacher_profiles
  FOR SELECT USING (is_active = true);

CREATE POLICY "Teachers can manage own profile" ON public.teacher_profiles
  FOR ALL USING (auth.uid() = id);

-- =============================================
-- CENTERS
-- =============================================
CREATE POLICY "Public can view active centers" ON public.centers
  FOR SELECT USING (is_active = true);

CREATE POLICY "Teachers can manage own centers" ON public.centers
  FOR ALL USING (
    auth.uid() = teacher_id
    OR public.is_admin()
  );

-- =============================================
-- SUBJECTS (read-only for most)
-- =============================================
CREATE POLICY "Everyone can view active subjects" ON public.subjects
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage subjects" ON public.subjects
  FOR ALL USING (public.is_admin());

-- =============================================
-- COURSES
-- =============================================
CREATE POLICY "Public can view active courses" ON public.courses
  FOR SELECT USING (is_active = true);

CREATE POLICY "Teachers can manage own courses" ON public.courses
  FOR ALL USING (
    auth.uid() = teacher_id
    OR public.is_admin()
  );

-- =============================================
-- SCHEDULES
-- =============================================
CREATE POLICY "Public can view active schedules" ON public.schedules
  FOR SELECT USING (is_active = true);

CREATE POLICY "Teachers can manage own schedules" ON public.schedules
  FOR ALL USING (
    auth.uid() IN (SELECT teacher_id FROM public.courses WHERE id = course_id)
    OR public.is_admin()
  );

-- =============================================
-- BOOKINGS
-- =============================================
CREATE POLICY "Parents can view own bookings" ON public.bookings
  FOR SELECT USING (
    auth.uid() = parent_id
    OR auth.uid() IN (SELECT teacher_id FROM public.courses WHERE id = course_id)
    OR public.is_admin()
  );

CREATE POLICY "Parents can create bookings" ON public.bookings
  FOR INSERT WITH CHECK (auth.uid() = parent_id);

CREATE POLICY "Parents can update own bookings" ON public.bookings
  FOR UPDATE USING (auth.uid() = parent_id);

CREATE POLICY "Teachers can update booking status" ON public.bookings
  FOR UPDATE USING (
    auth.uid() IN (SELECT teacher_id FROM public.courses WHERE id = course_id)
    OR public.is_admin()
  );

-- =============================================
-- ATTENDANCE
-- =============================================
CREATE POLICY "Related users can view attendance" ON public.attendance
  FOR SELECT USING (
    auth.uid() IN (
      SELECT parent_id FROM public.bookings WHERE id = booking_id
      UNION
      SELECT c.teacher_id FROM public.bookings b JOIN public.courses c ON b.course_id = c.id WHERE b.id = booking_id
    )
    OR public.is_admin()
  );

CREATE POLICY "Teachers can manage attendance" ON public.attendance
  FOR ALL USING (
    auth.uid() IN (
      SELECT c.teacher_id FROM public.bookings b
      JOIN public.courses c ON b.course_id = c.id
      WHERE b.id = booking_id
    )
    OR public.is_admin()
  );

-- =============================================
-- SESSION REPORTS
-- =============================================
CREATE POLICY "Related users can view reports" ON public.session_reports
  FOR SELECT USING (
    auth.uid() IN (
      SELECT parent_id FROM public.bookings WHERE id = booking_id
      UNION
      SELECT c.teacher_id FROM public.bookings b JOIN public.courses c ON b.course_id = c.id WHERE b.id = booking_id
    )
    OR public.is_admin()
  );

CREATE POLICY "Teachers can create reports" ON public.session_reports
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT c.teacher_id FROM public.bookings b
      JOIN public.courses c ON b.course_id = c.id
      WHERE b.id = booking_id
    )
  );

CREATE POLICY "Teachers can update own reports" ON public.session_reports
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT c.teacher_id FROM public.bookings b
      JOIN public.courses c ON b.course_id = c.id
      WHERE b.id = booking_id
    )
  );

-- =============================================
-- REVIEWS
-- =============================================
CREATE POLICY "Public can view visible reviews" ON public.reviews
  FOR SELECT USING (is_visible = true AND is_verified = true);

CREATE POLICY "Parents can create reviews for completed bookings" ON public.reviews
  FOR INSERT WITH CHECK (
    auth.uid() = parent_id
    AND EXISTS(SELECT 1 FROM public.bookings WHERE id = booking_id AND status = 'completed')
  );

CREATE POLICY "Admins can manage reviews" ON public.reviews
  FOR ALL USING (public.is_admin());

-- =============================================
-- PAYMENTS
-- =============================================
CREATE POLICY "Parents can view own payments" ON public.payments
  FOR SELECT USING (auth.uid() = parent_id OR public.is_admin());

CREATE POLICY "Parents can create payments" ON public.payments
  FOR INSERT WITH CHECK (auth.uid() = parent_id);

CREATE POLICY "System can update payment status" ON public.payments
  FOR UPDATE USING (true); -- webhook uses service_role

-- =============================================
-- NOTIFICATIONS
-- =============================================
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "System can create notifications" ON public.notifications
  FOR INSERT WITH CHECK (true); -- server-side uses service_role
