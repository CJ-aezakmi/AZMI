import { Toaster } from '@/components/ui/sonner';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';

const App = () => (
  <>
    <Toaster />
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  </>
);

export default App;