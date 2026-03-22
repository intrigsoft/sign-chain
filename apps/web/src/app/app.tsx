import { Route, Routes } from 'react-router-dom';
import VerifyPage from './verify';
import HomePage from './home';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/v/:txHashB64" element={<VerifyPage />} />
    </Routes>
  );
}

export default App;
