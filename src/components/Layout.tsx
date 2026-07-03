import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './layout-fanta.css'

type NavItem = { to: string; label: string; end?: boolean; fanta?: boolean }

const navItems: NavItem[] = [
  { to: '/', label: 'Home', end: true },
  { to: '/giocatori', label: 'Giocatori' },
  { to: '/partite', label: 'Partite' },
  { to: '/statistiche', label: 'Statistiche' },
  { to: '/fantacalcetto', label: 'Fantacalcetto', fanta: true },
]

function NavLabel({ item, isActive }: { item: NavItem; isActive: boolean }) {
  if (item.fanta) {
    return (
      <span className={`fanta-label ${isActive ? 'fanta-label--active' : ''}`}>
        {item.label}
      </span>
    )
  }
  return <>{item.label}</>
}

export default function Layout() {
  const { isAdmin, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  const lastItem: NavItem = isAdmin
    ? { to: '/admin', label: 'CDA' }
    : { to: '/impostazioni', label: 'Impostazioni' }
  const items = [...navItems, lastItem]

  function handleLogout() {
    if (confirm('Vuoi davvero uscire?')) {
      signOut()
    }
  }

  return (
    <div className="flex min-h-svh" style={{ background: '#0a1a0f' }}>
      {/* Sidebar desktop */}
      <aside
        className="hidden md:flex flex-col fixed inset-y-0 left-0 z-40 w-52"
        style={{ background: 'rgba(0,0,0,0.55)' }}
      >
        <div className="px-5 pt-7 pb-5 flex flex-col items-center gap-2">
          <img
            src="/icons/pavone_logo.png"
            alt="Pavone League"
            className="h-14 w-14 rounded-2xl object-cover shadow-lg"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
          <span
            className="text-lg font-black tracking-tight text-center leading-tight"
            style={{ color: '#a8d5a2', letterSpacing: '-0.02em' }}
          >
            PAVONE<br />LEAGUE
          </span>
        </div>

        <nav className="flex flex-col gap-1 px-4 mt-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end ?? false}
              className={({ isActive }) =>
                item.fanta
                  ? 'px-3 py-2.5'
                  : `px-3 py-2.5 text-sm uppercase tracking-widest font-semibold transition-colors duration-150 ${
                      isActive ? 'text-white' : 'text-white/40 hover:text-white/70'
                    }`
              }
            >
              {({ isActive }) => <NavLabel item={item} isActive={isActive} />}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={handleLogout}
          className="mt-auto mx-4 mb-5 px-3 py-2.5 text-left text-sm uppercase tracking-widest font-semibold text-white/40 hover:text-white/70 transition-colors duration-150"
        >
          Logout
        </button>
      </aside>

      {/* Topbar mobile */}
      <header
        className="md:hidden fixed inset-x-0 top-0 z-40 flex items-center justify-between px-4 h-12"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      >
        <div className="flex items-center gap-2">
          <img
            src="/icons/pavone_logo.png"
            alt=""
            className="h-7 w-7 rounded-lg object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
          <span className="text-sm font-black tracking-tight" style={{ color: '#a8d5a2', letterSpacing: '-0.01em' }}>
            PAVONE LEAGUE
          </span>
        </div>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex flex-col justify-center gap-1.5 w-7 h-7 focus:outline-none"
          aria-label="Menu"
        >
          <span
            className={`block h-0.5 rounded transition-all duration-200 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`}
            style={{ background: 'white', width: '22px' }}
          />
          <span
            className={`block h-0.5 rounded transition-all duration-200 ${menuOpen ? 'opacity-0' : ''}`}
            style={{ background: 'white', width: '16px' }}
          />
          <span
            className={`block h-0.5 rounded transition-all duration-200 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`}
            style={{ background: 'white', width: '22px' }}
          />
        </button>
      </header>

      {/* Dropdown menu mobile */}
      {menuOpen && (
        <div
          className="md:hidden fixed inset-x-0 top-12 z-30 flex flex-col py-2"
          style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)' }}
        >
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end ?? false}
              onClick={() => setMenuOpen(false)}
              className="px-6 py-3"
            >
              {({ isActive }) =>
                item.fanta ? (
                  <NavLabel item={item} isActive={isActive} />
                ) : (
                  <span
                    className={`text-sm uppercase tracking-widest font-semibold ${
                      isActive ? 'text-white' : 'text-white/50'
                    }`}
                  >
                    {item.label}
                  </span>
                )
              }
            </NavLink>
          ))}
          <button
            onClick={() => {
              setMenuOpen(false)
              handleLogout()
            }}
            className="px-6 py-3 text-left text-sm uppercase tracking-widest font-semibold text-white/50"
          >
            Logout
          </button>
        </div>
      )}

      {/* Contenuto principale */}
      <main className="flex-1 md:ml-52 pt-12 md:pt-0 min-h-svh bg-gray-50">
        <Outlet />
      </main>
    </div>
  )
}
