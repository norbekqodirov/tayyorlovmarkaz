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
          <Route path="marketing" element={<CrmMarketing />} />
          <Route path="leads" element={<CrmLeads />} />
          <Route path="students" element={<CrmStudents />} />
          <Route path="groups" element={<CrmGroups />} />
          <Route path="schedule" element={<CrmSchedule />} />
          <Route path="journal" element={<CrmJournal />} />
          <Route path="attendance" element={<CrmAttendance />} />
          <Route path="assessment" element={<CrmAssessment />} />
          <Route path="rooms" element={<CrmRooms />} />
          <Route path="staff" element={<CrmStaff />} />
          <Route path="teachers" element={<CrmTeachers />} />
          <Route path="finance" element={<CrmFinance />} />
          <Route path="bi" element={<CrmBI />} />
          <Route path="courses" element={<CrmCourses />} />
          <Route path="inventory" element={<CrmInventory />} />
          <Route path="content" element={<CrmContent />} />
          <Route path="forms" element={<CrmForms />} />
          <Route path="settings" element={<CrmSettings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
