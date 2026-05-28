import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Wrench, History, Settings, Menu, X, Calendar, LogOut, Anchor, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/AuthProvider";
import cemapiLogo from "@/assets/cemapi-logo.png";

const navItemsTop = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/motores", label: "Motores", icon: Wrench },
  { to: "/historico", label: "Histórico", icon: History },
  { to: "/calendario", label: "Calendário", icon: Calendar },
];

const navItemsBottom = [
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

const PROVAS_MAR_SUBITEMS = [
  { to: "/provas-mar/registrar", label: "Registrar Corrida" },
  { to: "/provas-mar/historico", label: "Histórico" },
  { to: "/provas-mar/estatisticas", label: "Estatísticas" },
];

function NavLink({
  to,
  label,
  icon: Icon,
  active,
  onClick,
  desktop,
}: {
  to: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick?: () => void;
  desktop: boolean;
}) {
  if (desktop) {
    return (
      <Link
        to={to}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
          active
            ? "bg-sidebar-accent text-sidebar-primary"
            : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
        )}
      >
        <Icon className="h-4 w-4" />
        {label}
      </Link>
    );
  }
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [provasMarOpen, setProvasMarOpen] = useState(() =>
    location.pathname.startsWith("/provas-mar")
  );

  useEffect(() => {
    if (location.pathname.startsWith("/provas-mar")) {
      setProvasMarOpen(true);
    }
  }, [location.pathname]);

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  const isProvasMar = location.pathname.startsWith("/provas-mar");

  return (
    <div className="min-h-screen flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-60 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="px-2 py-4 flex items-center justify-center bg-white">
          <img
            src={cemapiLogo}
            alt="CEMAPI Fleet Intelligence Hub"
            className="w-full h-auto max-h-32 object-contain"
          />
        </div>
        <nav className="flex-1 px-3 pt-4 space-y-1">
          {navItemsTop.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} label={label} icon={icon} active={location.pathname === to} desktop />
          ))}

          {/* Provas de Mar — expandable */}
          <div>
            <button
              onClick={() => setProvasMarOpen((v) => !v)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full transition-colors",
                isProvasMar
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <Anchor className="h-4 w-4" style={{ color: "#2ABFBF" }} />
              <span className="flex-1 text-left">Provas de Mar</span>
              {provasMarOpen
                ? <ChevronUp className="h-3 w-3 opacity-60" />
                : <ChevronDown className="h-3 w-3 opacity-60" />}
            </button>
            {provasMarOpen && (
              <div className="ml-7 mt-0.5 space-y-0.5">
                {PROVAS_MAR_SUBITEMS.map(({ to, label }) => (
                  <Link
                    key={to}
                    to={to}
                    className={cn(
                      "flex items-center px-3 py-2 rounded-lg text-sm transition-colors",
                      location.pathname === to
                        ? "bg-sidebar-accent text-sidebar-primary font-medium"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                    )}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {navItemsBottom.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} label={label} icon={icon} active={location.pathname === to} desktop />
          ))}
        </nav>

        {/* User / Logout */}
        <div className="px-3 py-4 border-t border-sidebar-border">
          {user?.email && (
            <p className="text-xs text-sidebar-foreground/50 px-3 mb-2 truncate" title={user.email}>
              {user.email}
            </p>
          )}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex-1 flex flex-col">
        <header className="md:hidden flex items-center justify-between p-3 border-b bg-white">
          <img src={cemapiLogo} alt="CEMAPI Fleet Intelligence Hub" className="h-9 w-auto" />
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </header>

        {/* Mobile nav */}
        {mobileOpen && (
          <nav className="md:hidden border-b bg-card px-4 pb-3 space-y-1">
            {navItemsTop.map(({ to, label, icon }) => (
              <NavLink key={to} to={to} label={label} icon={icon} active={location.pathname === to} onClick={() => setMobileOpen(false)} desktop={false} />
            ))}

            {/* Provas de Mar mobile */}
            <div>
              <button
                onClick={() => setProvasMarOpen((v) => !v)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full transition-colors",
                  isProvasMar
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                <Anchor className="h-4 w-4" style={{ color: "#2ABFBF" }} />
                <span className="flex-1 text-left">Provas de Mar</span>
                {provasMarOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {provasMarOpen && (
                <div className="ml-7 mt-0.5 space-y-0.5">
                  {PROVAS_MAR_SUBITEMS.map(({ to, label }) => (
                    <Link
                      key={to}
                      to={to}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center px-3 py-2 rounded-lg text-sm transition-colors",
                        location.pathname === to
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                      )}
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {navItemsBottom.map(({ to, label, icon }) => (
              <NavLink key={to} to={to} label={label} icon={icon} active={location.pathname === to} onClick={() => setMobileOpen(false)} desktop={false} />
            ))}

            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </nav>
        )}

        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

