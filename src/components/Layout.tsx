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
  const { isAdmin } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  const lastItem: NavItem = isAdmin
    ? { to: '/admin', label: 'Admin' }
    : { to: '/impostazioni', label: 'Impostazioni' }
  const items = [...navItems, lastItem]

  return (
    <div className="flex min-h-svh" style={{ background: '#0a1a0f' }}>
      {/* Sidebar desktop */}
      <aside
        className="hidden md:flex flex-col fixed inset-y-0 left-0 z-40 w-52"
        style={{ background: 'rgba(0,0,0,0.55)' }}
      >
        <div className="px-6 pt-8 pb-6">
          <span
            className="text-2xl font-black tracking-tight"
            style={{ color: '#a8d5a2', fontStyle: 'italic', letterSpacing: '-0.03em' }}
          >
            CALCETTO
          </span>
          <div className="mt-0.5 text-[10px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.35)' }}>
            La tua squadra
          </div>
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
      </aside>

      {/* Topbar mobile */}
      <header
        className="md:hidden fixed inset-x-0 top-0 z-40 flex items-center justify-between px-4 h-12"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      >
        <span className="text-base font-black italic tracking-tight" style={{ color: '#a8d5a2' }}>
          CALCETTO
        </span>
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
              className={item.fanta ? 'px-6 py-3' : undefined}
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
        </div>
      )}

      {/* Contenuto principale */}
      <main className="flex-1 md:ml-52 pt-12 md:pt-0 min-h-svh bg-gray-50">
        <Outlet />
      </main>
    </div>
  )
}
