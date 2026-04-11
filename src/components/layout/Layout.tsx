import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'

export function Layout() {
  return (
    <div className="flex flex-col h-screen">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden lg:block">
          <Sidebar />
        </div>
        <main className="flex-1 overflow-y-auto p-3 lg:p-6 pb-16 lg:pb-6">
          <Outlet />
        </main>
      </div>
      <div className="lg:hidden">
        <BottomNav />
      </div>
    </div>
  )
}
