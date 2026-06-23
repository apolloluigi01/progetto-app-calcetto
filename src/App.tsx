import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Home from './pages/Home'
import Giocatori from './pages/Giocatori'
import GiocatoreDetail from './pages/GiocatoreDetail'
import Partite from './pages/Partite'
import PartitaForm from './pages/PartitaForm'
import MatchDetail from './pages/MatchDetail'
import Statistiche from './pages/Statistiche'
import StatisticheElenco from './pages/StatisticheElenco'
import StatisticaDettaglio from './pages/StatisticaDettaglio'
import Profilo from './pages/Profilo'
import AdminHome from './pages/admin/AdminHome'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/giocatori" element={<Giocatori />} />
              <Route path="/giocatori/:id" element={<GiocatoreDetail />} />
              <Route path="/partite" element={<Partite />} />
              <Route path="/partite/:id" element={<MatchDetail />} />
              <Route path="/statistiche" element={<Statistiche />} />
              <Route path="/statistiche/elenco" element={<StatisticheElenco />} />
              <Route path="/statistiche/:key" element={<StatisticaDettaglio />} />
              <Route path="/profilo" element={<Profilo />} />

              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<AdminHome />} />
                <Route path="/partite/nuova" element={<PartitaForm />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
