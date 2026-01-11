import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, LogOut, Command, Users, Settings } from "lucide-react";
import { toast } from "sonner";

import AdminCommandCenter from "./AdminCommandCenter";
import AmbulanceFleetManagement from "@/components/AmbulanceFleetManagement";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user, profile, loading, signOut } = useAuth();

  React.useEffect(() => {
    if (
      !loading &&
      (!user || !["admin", "super_admin"].includes(profile?.role || ""))
    ) {
      toast.error("Access Denied - Admin privileges required");
      navigate("/");
    }
  }, [user, profile, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mx-auto mb-4" />
          <p>Loading Admin Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <nav className="border-b border-slate-700 bg-slate-800/80 backdrop-blur-xl px-4 py-3">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-amber-500" />
            <div>
              <span className="font-bold text-white text-lg">
                ADMIN DASHBOARD
              </span>
              <Badge
                variant="outline"
                className="ml-2 text-amber-400 border-amber-500"
              >
                {profile?.role?.toUpperCase()}
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">{profile?.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="text-slate-300"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">
            Admin Control Panel
          </h1>
          <p className="text-slate-400">
            City-wide emergency monitoring & operational overview
          </p>
        </div>

        <Tabs defaultValue="command" className="space-y-4">
          <TabsList className="bg-slate-800 border border-slate-700">
            <TabsTrigger
              value="command"
              className="data-[state=active]:bg-amber-600"
            >
              <Command className="w-4 h-4 mr-2" />
              Command Center
            </TabsTrigger>

            <TabsTrigger
              value="fleet"
              className="data-[state=active]:bg-amber-600"
            >
              <Users className="w-4 h-4 mr-2" />
              Fleet Management
            </TabsTrigger>

            <TabsTrigger
              value="settings"
              className="data-[state=active]:bg-amber-600"
            >
              <Settings className="w-4 h-4 mr-2" />
              System Overview
            </TabsTrigger>
          </TabsList>

          {/* Command Center */}
          <TabsContent value="command">
            <AdminCommandCenter />
          </TabsContent>

          {/* Fleet */}
          <TabsContent value="fleet">
            <AmbulanceFleetManagement />
          </TabsContent>

          {/* System Overview */}
          <TabsContent value="settings">
            <Card className="bg-slate-800/60 border border-slate-700 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-white">
                  System Configuration Overview
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Current operational rules 
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-6">
                <InfoSection
                  title="🚨 Emergency Management"
                  items={[
                    "System is globally ACTIVE",
                    "Green corridors are auto‑managed",
                    "Manual override available to admins",
                  ]}
                />

                <InfoSection
                  title="🏥 Hospital Policies"
                  items={[
                    "Hospital approval required for all emergencies",
                    "ICU & bed availability tracked in real time",
                    "Overloaded hospitals are deprioritized",
                  ]}
                />

                <InfoSection
                  title="🚑 Ambulance Permissions"
                  items={[
                    "Drivers can initiate emergency requests",
                    "All driver requests require hospital approval",
                    "Live GPS tracking is mandatory",
                  ]}
                />

                <InfoSection
                  title="🔐 Security & Audit"
                  items={[
                    "All admin actions are logged",
                    "Role‑based access control enforced",
                    "System changes restricted during live emergencies",
                  ]}
                />

                <InfoSection
                  title="🎨 Interface"
                  items={[
                    "Dark theme enforced for all dashboards",
                    "Optimized for low‑light control rooms",
                  ]}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/* ================= Info Section Component ================= */

function InfoSection({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-4">
      <h3 className="text-white font-semibold mb-2">{title}</h3>
      <ul className="list-disc list-inside text-slate-400 text-sm space-y-1">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
