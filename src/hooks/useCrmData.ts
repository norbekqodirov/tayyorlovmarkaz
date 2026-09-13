import { useState, useEffect } from 'react';
import api from '../api/client';

/**
 * Shared hook for fetching relational CRM data (courses, teachers, rooms, groups, students)
 * Used across Groups, Schedule, Students, Attendance, etc. forms to power smart dropdowns.
 */
export function useCrmData() {
  const [courses, setCourses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [coursesRes, teachersRes, roomsRes, groupsRes, studentsRes] = await Promise.allSettled([
          api.get('/courses'),
          // /auth/users (barcha maydonlar bilan) ADMIN+ uchun ochiq — bu hook
          // esa TEACHER/MANAGER ham ko'radigan sahifalarda ishlatiladi
          // (Schedule/Students/BI/Leads), shuning uchun tor, xavfsiz
          // proyeksiya ishlatiladi (ilgari ADMIN bo'lmagan har bir rol uchun
          // bu so'rov jimgina 403 bo'lib, o'qituvchi dropdown'i bo'sh qolardi).
          api.get('/auth/users/assignable-teachers'),
          api.get('/rooms'),
          api.get('/groups'),
          api.get('/students'),
        ]);

        if (coursesRes.status === 'fulfilled') setCourses(coursesRes.value.data || []);
        if (teachersRes.status === 'fulfilled') {
          // /auth/users/assignable-teachers allaqachon TEACHER/ADMIN/
          // SUPER_ADMIN'ga filtrlangan holda qaytadi.
          setTeachers(teachersRes.value.data || []);
        }
        if (roomsRes.status === 'fulfilled') setRooms(roomsRes.value.data || []);
        if (groupsRes.status === 'fulfilled') setGroups(groupsRes.value.data || []);
        if (studentsRes.status === 'fulfilled') setStudents(studentsRes.value.data || []);
      } catch (err) {
        console.error('Failed to load CRM data:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  /**
   * Given a courseId, return its possible lesson start times based on lessonsPerWeek.
   * e.g. for a 3x/week course: ['09:00', '11:00', '14:00', '16:00']
   */
  const getTimeSlotsForCourse = (courseId: string): string[] => {
    const standard = ['09:00', '11:00', '14:00', '16:00', '18:00'];
    return standard;
  };

  /** Format lesson end time based on course lessonDuration (minutes) */
  const getEndTime = (startTime: string, lessonDurationMinutes: number = 90): string => {
    const [h, m] = startTime.split(':').map(Number);
    const total = h * 60 + m + lessonDurationMinutes;
    const eh = Math.floor(total / 60);
    const em = total % 60;
    return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
  };

  return { courses, teachers, rooms, groups, students, loading, getTimeSlotsForCourse, getEndTime };
}
