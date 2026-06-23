import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const navItems = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/giocatori', label: 'Giocatori', icon: '🧑‍🤝‍🧑' },
  { to: '/partite', label: 'Partite', icon: '⚽' },
  { to: '/statistiche', label: 'Statistiche', icon: '📊' },
]

export default function Layout() {
  const { isAdmin } = useAuth()
  const lastItem = isAdmin
    ? { to: '/admin', label: 'Admin', icon: '👤' }
    : { to: '/impostazioni', label: 'Impostazioni', icon: '⚙️' }
  const items = [...navItems, lastItem]

  return (
    <div className="flex min-h-svh flex-col bg-gray-50">
      <main className="flex-1 pb-20">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 flex border-t border-gray-200 bg-white">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
                isActive ? 'text-field-green font-semibold' : 'text-gray-500'
              }`
            }
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
