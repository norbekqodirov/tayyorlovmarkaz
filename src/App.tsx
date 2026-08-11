import { BrowserRouter, Routes, Route } from 'react-router-dom';
import React, { Suspense, useEffect } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { captureAttribution } from './utils/utm';

import Layout from './components/Layout';
import CrmLayout from './components/CrmLayout';
import ProtectedRoute from './components/ProtectedRoute';

// Public Lazy Routes
const Home             = React.lazy(() => import('./pages/Home'));
const Results          = React.lazy(() => import('./pages/Results'));
const EducationSystem  = React.lazy(() => import('./pages/EducationSystem'));
const Teachers         = React.lazy(() => import('./pages/Teachers'));
const Contact          = React.lazy(() => import('./pages/Contact'));
const LeadForm         = React.lazy(() => import('./pages/LeadForm'));
const Blog             = React.lazy(() => import('./pages/Blog'));
const BlogPost         = React.lazy(() => import('./pages/BlogPost'));
const About            = React.lazy(() => import('./pages/About'));

// CRM Lazy Routes
const CrmLogin      = React.lazy(() => import('./pages/crm/CrmLogin'));
const CrmDashboard  = React.lazy(() => import('./pages/crm/education/CrmDashboard'));
const CrmLeads      = React.lazy(() => import('./pages/crm/marketing/CrmLeads'));
const CrmContent    = React.lazy(() => import('./pages/crm/management/CrmContent'));
const CrmForms      = React.lazy(() => import('./pages/crm/marketing/CrmForms'));
const CrmSettings   = React.lazy(() => import('./pages/crm/management/CrmSettings'));
const CrmStudents   = React.lazy(() => import('./pages/crm/education/CrmStudents'));
const CrmTeachers   = React.lazy(() => import('./pages/crm/hr/CrmTeachers'));
const CrmFinance    = React.lazy(() => import('./pages/crm/finance/CrmFinance'));
const CrmGroups     = React.lazy(() => import('./pages/crm/education/CrmGroups'));
const CrmGroupDetail= React.lazy(() => import('./pages/crm/education/CrmGroupDetail'));
const CrmJournal    = React.lazy(() => import('./pages/crm/education/CrmJournal'));
const CrmSchedule   = React.lazy(() => import('./pages/crm/education/CrmSchedule'));
const CrmRooms      = React.lazy(() => import('./pages/crm/management/CrmRooms'));
const CrmMarketing  = React.lazy(() => import('./pages/crm/marketing/CrmMarketing'));
const CrmStaff      = React.lazy(() => import('./pages/crm/hr/CrmStaff'));
const CrmStaffDetail = React.lazy(() => import('./pages/crm/hr/CrmStaffDetail'));
const CrmBI         = React.lazy(() => import('./pages/crm/analytics/CrmBI'));
const CrmCourses    = React.lazy(() => import('./pages/crm/education/CrmCourses'));
const CrmInventory  = React.lazy(() => import('./pages/crm/management/CrmInventory'));
const CrmUsers          = React.lazy(() => import('./pages/crm/management/CrmUsers'));
const CrmCommunication   = React.lazy(() => import('./pages/crm/marketing/CrmCommunication'));
const CrmStudentDetail   = React.lazy(() => import('./pages/crm/education/CrmStudentDetail'));
const CrmTelegram        = React.lazy(() => import('./pages/crm/communication/CrmTelegram'));
const CrmQuiz            = React.lazy(() => import('./pages/crm/education/CrmQuiz'));
const PublicQuiz         = React.lazy(() => import('./pages/PublicQuiz'));
const CrmAIContent       = React.lazy(() => import('./pages/crm/marketing/CrmAIContent'));
const CrmPredictions     = React.lazy(() => import('./pages/crm/analytics/CrmPredictions'));
const CrmGoals           = React.lazy(() => import('./pages/crm/analytics/CrmGoals'));
const TelegramPortal     = React.lazy(() => import('./pages/portal/TelegramPortal'));
const StaffPortal        = React.lazy(() => import('./pages/portal/StaffPortal'));
const CrmAutomations     = React.lazy(() => import('./pages/crm/management/CrmAutomations'));
const CrmAudit           = React.lazy(() => import('./pages/crm/management/CrmAudit'));
const CrmCertificates    = React.lazy(() => import('./pages/crm/management/CrmCertificates'));
const CrmReports         = React.lazy(() => import('./pages/crm/management/CrmReports'));
const VerifyCert         = React.lazy(() => import('./pages/VerifyCert'));
const CrmMessages        = React.lazy(() => import('./pages/crm/communication/CrmMessages'));
const CrmParentChat      = React.lazy(() => import('./pages/crm/communication/CrmParentChat'));
const CrmAnnouncements   = React.lazy(() => import('./pages/crm/communication/CrmAnnouncements'));
const CrmBranches        = React.lazy(() => import('./pages/crm/management/CrmBranches'));
const CrmDiscounts       = React.lazy(() => import('./pages/crm/finance/CrmDiscounts'));
const CrmTests           = React.lazy(() => import('./pages/crm/education/CrmTests'));
const CrmLeaveRequests   = React.lazy(() => import('./pages/crm/hr/CrmLeaveRequests'));
const CrmExecutiveReport = React.lazy(() => import('./pages/crm/analytics/CrmExecutiveReport'));
const CrmCourseDetail    = React.lazy(() => import('./pages/crm/education/CrmCourseDetail'));
const CrmStudentProgress   = React.lazy(() => import('./pages/crm/education/CrmStudentProgress'));
const CrmStaffAttendance   = React.lazy(() => import('./pages/crm/hr/CrmStaffAttendance'));
const CrmWorkLocations     = React.lazy(() => import('./pages/crm/hr/CrmWorkLocations'));
const GlobalSpinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-4 border-blue-600/20" />
        <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
      </div>
      <p className="text-zinc-500 dark:text-zinc-400 font-bold text-xs uppercase tracking-widest animate-pulse">Yuklanmoqda...</p>
    </div>
  </div>
);

export default function App() {
  useEffect(() => { captureAttribution(); }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<GlobalSpinner />}>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="biz-haqimizda" element={<About />} />
              <Route path="natijalar" element={<Results />} />
              <Route path="talim-tizimi" element={<EducationSystem />} />
              <Route path="ustozlar" element={<Teachers />} />
              <Route path="blog" element={<Blog />} />
              <Route path="blog/:id" element={<BlogPost />} />
              <Route path="boglanish" element={<Contact />} />
            </Route>

            <Route path="/l/:formId" element={<LeadForm />} />
            <Route path="/test/:slug" element={<PublicQuiz />} />
            <Route path="/portal" element={<TelegramPortal />} />
            <Route path="/staff-portal" element={<StaffPortal />} />
            <Route path="/verify-cert/:id" element={<VerifyCert />} />

            {/* CRM Routes */}
            <Route path="/crmtayyorlovmarkaz/login" element={<CrmLogin />} />
            <Route
              path="/crmtayyorlovmarkaz"
              element={
                <ProtectedRoute>
                  <CrmLayout />
                </ProtectedRoute>
              }
            >
              {/* Dashboard — barcha autentifikatsiyadan o'tgan foydalanuvchilar */}
              <Route index element={<CrmDashboard />} />

              {/* ─── Ta'lim ─── */}
              <Route path="students"               element={<ProtectedRoute requiredPermission="students" allowedRoles={['ADMIN','TEACHER','MANAGER']}><CrmStudents /></ProtectedRoute>} />
              <Route path="students/:id/progress"  element={<ProtectedRoute requiredPermission="students" allowedRoles={['ADMIN','TEACHER','MANAGER']}><CrmStudentProgress /></ProtectedRoute>} />
              <Route path="students/:id"           element={<ProtectedRoute requiredPermission="students" allowedRoles={['ADMIN','TEACHER','MANAGER']}><CrmStudentDetail /></ProtectedRoute>} />
              <Route path="groups"     element={<ProtectedRoute requiredPermission="groups"   allowedRoles={['ADMIN','TEACHER','MANAGER']}><CrmGroups /></ProtectedRoute>} />
              <Route path="groups/:id" element={<ProtectedRoute requiredPermission="groups"   allowedRoles={['ADMIN','TEACHER','MANAGER']}><CrmGroupDetail /></ProtectedRoute>} />
              <Route path="courses"     element={<ProtectedRoute requiredPermission="courses" allowedRoles={['ADMIN','MANAGER']}><CrmCourses /></ProtectedRoute>} />
              <Route path="courses/:id" element={<ProtectedRoute requiredPermission="courses" allowedRoles={['ADMIN','MANAGER']}><CrmCourseDetail /></ProtectedRoute>} />
              <Route path="schedule" element={<ProtectedRoute requiredPermission="schedule" allowedRoles={['ADMIN','TEACHER','MANAGER']}><CrmSchedule /></ProtectedRoute>} />
              <Route path="journal"  element={<ProtectedRoute requiredPermission="journal"  allowedRoles={['ADMIN','TEACHER']}><CrmJournal /></ProtectedRoute>} />
              <Route path="quiz"     element={<ProtectedRoute requiredPermission="content"  allowedRoles={['ADMIN','TEACHER','MANAGER']}><CrmQuiz /></ProtectedRoute>} />
              <Route path="tests"    element={<ProtectedRoute requiredPermission="journal"  allowedRoles={['ADMIN','TEACHER','MANAGER']}><CrmTests /></ProtectedRoute>} />

              {/* ─── Marketing ─── */}
              <Route path="leads"        element={<ProtectedRoute requiredPermission="leads"        allowedRoles={['ADMIN','MANAGER']}><CrmLeads /></ProtectedRoute>} />
              <Route path="forms"        element={<ProtectedRoute requiredPermission="target_forms" allowedRoles={['ADMIN']}><CrmForms /></ProtectedRoute>} />
              <Route path="marketing"    element={<ProtectedRoute requiredPermission="marketing"    allowedRoles={['ADMIN','MANAGER']}><CrmMarketing /></ProtectedRoute>} />
              <Route path="ai-content"   element={<ProtectedRoute requiredPermission="marketing"    allowedRoles={['ADMIN','MANAGER']}><CrmAIContent /></ProtectedRoute>} />
              <Route path="communication" element={<ProtectedRoute requiredPermission="marketing"   allowedRoles={['ADMIN','MANAGER']}><CrmCommunication /></ProtectedRoute>} />

              {/* ─── Kommunikatsiya ─── */}
              <Route path="messages"      element={<ProtectedRoute requiredPermission="marketing" allowedRoles={['ADMIN','MANAGER']}><CrmMessages /></ProtectedRoute>} />
              <Route path="parent-chat"   element={<ProtectedRoute requiredPermission="parent_chat" allowedRoles={['ADMIN','MANAGER','TEACHER']}><CrmParentChat /></ProtectedRoute>} />
              <Route path="announcements" element={<ProtectedRoute requiredPermission="marketing" allowedRoles={['ADMIN','MANAGER']}><CrmAnnouncements /></ProtectedRoute>} />
              <Route path="telegram"      element={<ProtectedRoute allowedRoles={['ADMIN']}><CrmTelegram /></ProtectedRoute>} />

              {/* ─── HR (admin uchun — maxsus ruxsatlar ro'yxatida emas) ─── */}
              <Route path="teachers"         element={<ProtectedRoute allowedRoles={['ADMIN']}><CrmTeachers /></ProtectedRoute>} />
              <Route path="staff"            element={<ProtectedRoute allowedRoles={['ADMIN']}><CrmStaff /></ProtectedRoute>} />
              <Route path="staff/:id"        element={<ProtectedRoute allowedRoles={['ADMIN']}><CrmStaffDetail /></ProtectedRoute>} />
              <Route path="leave-requests"   element={<ProtectedRoute allowedRoles={['ADMIN','MANAGER']}><CrmLeaveRequests /></ProtectedRoute>} />
              <Route path="staff-attendance" element={<ProtectedRoute allowedRoles={['ADMIN','MANAGER']}><CrmStaffAttendance /></ProtectedRoute>} />
              <Route path="work-locations"   element={<ProtectedRoute allowedRoles={['ADMIN']}><CrmWorkLocations /></ProtectedRoute>} />

              {/* ─── Moliya ─── */}
              <Route path="finance"   element={<ProtectedRoute requiredPermission="finance" allowedRoles={['ADMIN','MANAGER']}><CrmFinance /></ProtectedRoute>} />
              <Route path="discounts" element={<ProtectedRoute requiredPermission="finance" allowedRoles={['ADMIN','MANAGER']}><CrmDiscounts /></ProtectedRoute>} />

              {/* ─── Analitika ─── */}
              <Route path="bi"               element={<ProtectedRoute requiredPermission="bi" allowedRoles={['ADMIN','MANAGER']}><CrmBI /></ProtectedRoute>} />
              <Route path="predictions"      element={<ProtectedRoute requiredPermission="bi" allowedRoles={['ADMIN','MANAGER']}><CrmPredictions /></ProtectedRoute>} />
              <Route path="goals"            element={<ProtectedRoute requiredPermission="bi" allowedRoles={['ADMIN','MANAGER']}><CrmGoals /></ProtectedRoute>} />
              <Route path="executive-report" element={<ProtectedRoute allowedRoles={['ADMIN']}><CrmExecutiveReport /></ProtectedRoute>} />

              {/* ─── Boshqaruv ─── */}
              <Route path="branches"     element={<ProtectedRoute allowedRoles={['ADMIN']}><CrmBranches /></ProtectedRoute>} />
              <Route path="rooms"        element={<ProtectedRoute requiredPermission="rooms"     allowedRoles={['ADMIN']}><CrmRooms /></ProtectedRoute>} />
              <Route path="inventory"    element={<ProtectedRoute requiredPermission="inventory" allowedRoles={['ADMIN']}><CrmInventory /></ProtectedRoute>} />
              <Route path="content"      element={<ProtectedRoute requiredPermission="content"   allowedRoles={['ADMIN']}><CrmContent /></ProtectedRoute>} />
              <Route path="automations"  element={<ProtectedRoute allowedRoles={['ADMIN']}><CrmAutomations /></ProtectedRoute>} />
              <Route path="certificates" element={<ProtectedRoute allowedRoles={['ADMIN','MANAGER']}><CrmCertificates /></ProtectedRoute>} />
              <Route path="reports"      element={<ProtectedRoute requiredPermission="bi" allowedRoles={['ADMIN','MANAGER']}><CrmReports /></ProtectedRoute>} />
              <Route path="audit"        element={<ProtectedRoute allowedRoles={['ADMIN']}><CrmAudit /></ProtectedRoute>} />
              <Route path="users"        element={<ProtectedRoute requiredPermission="users"    allowedRoles={['ADMIN']}><CrmUsers /></ProtectedRoute>} />
              <Route path="settings"     element={<ProtectedRoute requiredPermission="settings" allowedRoles={['ADMIN']}><CrmSettings /></ProtectedRoute>} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
