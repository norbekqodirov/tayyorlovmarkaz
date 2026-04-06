import { BrowserRouter, Routes, Route } from 'react-router-dom';
import React, { Suspense } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';

// Layouts and critical structural components don't always need lazy-loading
import Layout from './components/Layout';
import CrmLayout from './components/CrmLayout';
import ProtectedRoute from './components/ProtectedRoute';

// Public Lazy Routes
const Home = React.lazy(() => import('./pages/Home'));
const Results = React.lazy(() => import('./pages/Results'));
const EducationSystem = React.lazy(() => import('./pages/EducationSystem'));
const Teachers = React.lazy(() => import('./pages/Teachers'));
const Contact = React.lazy(() => import('./pages/Contact'));
const LeadForm = React.lazy(() => import('./pages/LeadForm'));
const Blog = React.lazy(() => import('./pages/Blog'));
const BlogPost = React.lazy(() => import('./pages/BlogPost'));
const About = React.lazy(() => import('./pages/About'));

// CRM Lazy Routes
const CrmLogin = React.lazy(() => import('./pages/crm/CrmLogin'));
const CrmDashboard = React.lazy(() => import('./pages/crm/CrmDashboard'));
const CrmLeads = React.lazy(() => import('./pages/crm/CrmLeads'));
const CrmContent = React.lazy(() => import('./pages/crm/CrmContent'));
const CrmForms = React.lazy(() => import('./pages/crm/CrmForms'));
const CrmSettings = React.lazy(() => import('./pages/crm/CrmSettings'));
const CrmStudents = React.lazy(() => import('./pages/crm/CrmStudents'));
const CrmTeachers = React.lazy(() => import('./pages/crm/CrmTeachers'));
const CrmFinance = React.lazy(() => import('./pages/crm/CrmFinance'));
const CrmGroups = React.lazy(() => import('./pages/crm/CrmGroups'));
const CrmSchedule = React.lazy(() => import('./pages/crm/CrmSchedule'));
const CrmAttendance = React.lazy(() => import('./pages/crm/CrmAttendance'));
const CrmRooms = React.lazy(() => import('./pages/crm/CrmRooms'));
const CrmMarketing = React.lazy(() => import('./pages/crm/CrmMarketing'));
const CrmStaff = React.lazy(() => import('./pages/crm/CrmStaff'));
const CrmAssessment = React.lazy(() => import('./pages/crm/CrmAssessment'));
const CrmJournal = React.lazy(() => import('./pages/crm/CrmJournal'));
const CrmBI = React.lazy(() => import('./pages/crm/CrmBI'));
const CrmCourses = React.lazy(() => import('./pages/crm/CrmCourses'));
const CrmInventory = React.lazy(() => import('./pages/crm/CrmInventory'));
const CrmUsers = React.lazy(() => import('./pages/crm/CrmUsers'));
const StudentPortal = React.lazy(() => import('./pages/portal/StudentPortal'));

const GlobalSpinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-4 border-blue-600/20"></div>
        <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
      </div>
      <p className="text-zinc-500 dark:text-zinc-400 font-bold text-xs uppercase tracking-widest animate-pulse">Yuklanmoqda...</p>
    </div>
  </div>
);

export default function App() {
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
            <Route path="/portal/:id" element={<StudentPortal />} />

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
              <Route index element={<CrmDashboard />} />
              <Route path="marketing" element={<ProtectedRoute allowedRoles={['ADMIN']}><CrmMarketing /></ProtectedRoute>} />
              <Route path="leads" element={<ProtectedRoute allowedRoles={['ADMIN']}><CrmLeads /></ProtectedRoute>} />
              <Route path="students" element={<ProtectedRoute allowedRoles={['ADMIN', 'TEACHER']}><CrmStudents /></ProtectedRoute>} />
              <Route path="groups" element={<ProtectedRoute allowedRoles={['ADMIN', 'TEACHER', 'STUDENT']}><CrmGroups /></ProtectedRoute>} />
              <Route path="schedule" element={<ProtectedRoute allowedRoles={['ADMIN', 'TEACHER', 'STUDENT']}><CrmSchedule /></ProtectedRoute>} />
              <Route path="journal" element={<ProtectedRoute allowedRoles={['ADMIN', 'TEACHER']}><CrmJournal /></ProtectedRoute>} />
              <Route path="attendance" element={<ProtectedRoute allowedRoles={['ADMIN', 'TEACHER']}><CrmAttendance /></ProtectedRoute>} />
              <Route path="assessment" element={<ProtectedRoute allowedRoles={['ADMIN', 'TEACHER']}><CrmAssessment /></ProtectedRoute>} />
              <Route path="rooms" element={<ProtectedRoute allowedRoles={['ADMIN']}><CrmRooms /></ProtectedRoute>} />
              <Route path="staff" element={<ProtectedRoute allowedRoles={['ADMIN']}><CrmStaff /></ProtectedRoute>} />
              <Route path="teachers" element={<ProtectedRoute allowedRoles={['ADMIN']}><CrmTeachers /></ProtectedRoute>} />
              <Route path="finance" element={<ProtectedRoute allowedRoles={['ADMIN', 'STUDENT']}><CrmFinance /></ProtectedRoute>} />
              <Route path="bi" element={<ProtectedRoute allowedRoles={['ADMIN']}><CrmBI /></ProtectedRoute>} />
              <Route path="courses" element={<ProtectedRoute allowedRoles={['ADMIN']}><CrmCourses /></ProtectedRoute>} />
              <Route path="inventory" element={<ProtectedRoute allowedRoles={['ADMIN']}><CrmInventory /></ProtectedRoute>} />
              <Route path="content" element={<ProtectedRoute allowedRoles={['ADMIN']}><CrmContent /></ProtectedRoute>} />
              <Route path="forms" element={<ProtectedRoute allowedRoles={['ADMIN']}><CrmForms /></ProtectedRoute>} />
              <Route path="settings" element={<ProtectedRoute allowedRoles={['ADMIN']}><CrmSettings /></ProtectedRoute>} />
              <Route path="users" element={<ProtectedRoute allowedRoles={['ADMIN']}><CrmUsers /></ProtectedRoute>} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
