import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Results from './pages/Results';
import EducationSystem from './pages/EducationSystem';
import Teachers from './pages/Teachers';
import Contact from './pages/Contact';
import LeadForm from './pages/LeadForm';
import Blog from './pages/Blog';
import BlogPost from './pages/BlogPost';
import About from './pages/About';

// CRM Components
import CrmLayout from './components/CrmLayout';
import CrmLogin from './pages/crm/CrmLogin';
import ProtectedRoute from './components/ProtectedRoute';
import CrmDashboard from './pages/crm/CrmDashboard';
import CrmLeads from './pages/crm/CrmLeads';
import CrmContent from './pages/crm/CrmContent';
import CrmForms from './pages/crm/CrmForms';
import CrmSettings from './pages/crm/CrmSettings';
import CrmStudents from './pages/crm/CrmStudents';
import CrmTeachers from './pages/crm/CrmTeachers';
import CrmFinance from './pages/crm/CrmFinance';
import CrmGroups from './pages/crm/CrmGroups';
import CrmSchedule from './pages/crm/CrmSchedule';
import CrmAttendance from './pages/crm/CrmAttendance';
import CrmRooms from './pages/crm/CrmRooms';
import CrmMarketing from './pages/crm/CrmMarketing';
import CrmStaff from './pages/crm/CrmStaff';
import CrmAssessment from './pages/crm/CrmAssessment';
import CrmJournal from './pages/crm/CrmJournal';
import CrmBI from './pages/crm/CrmBI';
import CrmCourses from './pages/crm/CrmCourses';
import CrmInventory from './pages/crm/CrmInventory';
import CrmUsers from './pages/crm/CrmUsers';
import StudentPortal from './pages/crm/StudentPortal';

export default function App() {
  return (
    <BrowserRouter>
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
          <Route path="portal" element={<ProtectedRoute allowedRoles={['STUDENT', 'ADMIN', 'TEACHER']}><StudentPortal /></ProtectedRoute>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
