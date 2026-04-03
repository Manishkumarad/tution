import { NavLink, Outlet, useNavigate } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/students', label: 'Students' },
  { to: '/students/new', label: 'Add Student' },
  { to: '/fee-plans', label: 'Fee Plans' },
  { to: '/recovery-audit', label: 'Recovery Audit' },
  { to: '/scan', label: 'QR Scan' }
];

export default function ShellLayout() {
  const navigate = useNavigate();

  function logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('studentId');
    navigate('/login');
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <h1>Tution</h1>
        <p>Tution Control Center</p>
        <nav>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button className="btn ghost" onClick={logout}>Logout</button>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
