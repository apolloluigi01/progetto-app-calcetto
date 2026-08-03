import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute'
import Layout from './components/Layout'
import PageLoader from './components/PageLoader'

// Le due schermate da cui si entra sempre restano nel bundle iniziale: farle
// caricare a parte aggiungerebbe solo un'attesa in piu' all'avvio.
import Login from './pages/Login'
import Home from './pages/Home'

// Tutto il resto arriva su richiesta: prima l'app era un unico file da ~750 kB
// che comprendeva anche l'intero pannello CDA, scaricato pure da chi non e'
// admin e non lo vedra' mai.
const PasswordDimenticata = lazy(() => import('./pages/PasswordDimenticata'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const ImpostaPassword = lazy(() => import('./pages/ImpostaPassword'))
const Giocatori = lazy(() => import('./pages/Giocatori'))
const GiocatoreDetail = lazy(() => import('./pages/GiocatoreDetail'))
const Partite = lazy(() => import('./pages/Partite'))
const PartitaForm = lazy(() => import('./pages/PartitaForm'))
const MatchDetail = lazy(() => import('./pages/MatchDetail'))
const MatchVoting = lazy(() => import('./pages/MatchVoting'))
const MatchPitch = lazy(() => import('./pages/MatchPitch'))
const Statistiche = lazy(() => import('./pages/Statistiche'))
const StatisticheStagione = lazy(() => import('./pages/StatisticheStagione'))
const StatisticheElenco = lazy(() => import('./pages/StatisticheElenco'))
const Impostazioni = lazy(() => import('./pages/Impostazioni'))
const Calendario = lazy(() => import('./pages/Calendario'))
const StagionePartite = lazy(() => import('./pages/StagionePartite'))
const AlboOro = lazy(() => import('./pages/AlboOro'))
const Fantacalcetto = lazy(() => import('./pages/Fantacalcetto'))
const FantaLega = lazy(() => import('./pages/FantaLega'))
const FantaFormazione = lazy(() => import('./pages/FantaFormazione'))
const RegistroAttivita = lazy(() => import('./pages/RegistroAttivita'))
const UfficioStampa = lazy(() => import('./pages/UfficioStampa'))

const AdminHome = lazy(() => import('./pages/admin/AdminHome'))
const GiocatoriAdmin = lazy(() => import('./pages/admin/GiocatoriAdmin'))
const GiocatoreEdit = lazy(() => import('./pages/admin/GiocatoreEdit'))
const PartiteAdmin = lazy(() => import('./pages/admin/PartiteAdmin'))
const MatchEdit = lazy(() => import('./pages/admin/MatchEdit'))
const StagioneEdit = lazy(() => import('./pages/admin/StagioneEdit'))
const StagioneStatisticaDettaglio = lazy(() => import('./pages/admin/StagioneStatisticaDettaglio'))
const FantaAdmin = lazy(() => import('./pages/admin/FantaAdmin'))
const FantaCreditiAdmin = lazy(() => import('./pages/admin/FantaCreditiAdmin'))
const OverallAdmin = lazy(() => import('./pages/admin/OverallAdmin'))
const FasceAdmin = lazy(() => import('./pages/admin/FasceAdmin'))
const AlboOroAdmin = lazy(() => import('./pages/admin/AlboOroAdmin'))
const StatisticheMensili = lazy(() => import('./pages/admin/StatisticheMensili'))

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/password-dimenticata" element={<PasswordDimenticata />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            <Route element={<ProtectedRoute />}>
              <Route path="/imposta-password" element={<ImpostaPassword />} />

              <Route element={<Layout />}>
                <Route path="/" element={<Home />} />
                <Route path="/giocatori" element={<Giocatori />} />
                <Route path="/giocatori/:id" element={<GiocatoreDetail />} />
                <Route path="/partite" element={<Partite />} />
                <Route path="/partite/stagione/:id" element={<StagionePartite />} />
                <Route path="/partite/:id" element={<MatchDetail />} />
                <Route path="/partite/:id/votazioni" element={<MatchVoting />} />
                <Route path="/partite/:id/campetto" element={<MatchPitch />} />
                <Route path="/statistiche" element={<Statistiche />} />
                <Route path="/statistiche/stagione/:id" element={<StatisticheStagione />} />
                <Route path="/statistiche/stagione/:id/elenco" element={<StatisticheElenco />} />
                <Route path="/statistiche/stagione/:id/:key" element={<StagioneStatisticaDettaglio />} />
                <Route path="/albo-oro" element={<AlboOro />} />
                <Route path="/impostazioni" element={<Impostazioni />} />
                <Route path="/calendario" element={<Calendario />} />
                <Route path="/ufficio-stampa" element={<UfficioStampa />} />
                <Route path="/fantacalcetto" element={<Fantacalcetto />} />
                <Route path="/fantacalcetto/:leagueId" element={<FantaLega />} />
                <Route path="/fantacalcetto/:leagueId/partite/:matchId" element={<FantaFormazione />} />
                <Route path="/registro-attivita" element={<RegistroAttivita />} />

                <Route element={<AdminRoute />}>
                  <Route path="/admin" element={<AdminHome />} />
                  <Route path="/partite/stagione/nuova" element={<StagioneEdit />} />
                  <Route path="/partite/stagione/:id/modifica" element={<StagioneEdit />} />
                  <Route path="/partite/stagione/:id/nuova-partita" element={<PartitaForm />} />
                  <Route path="/admin/giocatori" element={<GiocatoriAdmin />} />
                  <Route path="/admin/giocatori/:id" element={<GiocatoreEdit />} />
                  <Route path="/admin/fantacalcetto" element={<FantaAdmin />} />
                  <Route path="/admin/fanta-crediti" element={<FantaCreditiAdmin />} />
                  <Route path="/admin/overall" element={<OverallAdmin />} />
                  <Route path="/admin/fasce" element={<FasceAdmin />} />
                  <Route path="/admin/albo-oro" element={<AlboOroAdmin />} />
                  <Route path="/admin/statistiche-mensili" element={<StatisticheMensili />} />
                  <Route path="/admin/partite" element={<PartiteAdmin />} />
                  <Route path="/admin/partite/:id" element={<MatchEdit />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
