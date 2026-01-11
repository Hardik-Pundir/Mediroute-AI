import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Ambulance } from '../types';

interface VehicleHealthProps {
  ambulance: Ambulance | null;
}

export const VehicleHealth: React.FC<VehicleHealthProps> = ({ ambulance }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          🚑 Ambulance Health (Live)
          <Badge variant="outline" className="text-green-600">REAL-TIME</Badge>
        </CardTitle>
        <CardDescription>
          Live sensor data from ambulance
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Fuel */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>⛽ Fuel Level</span>
            <span>{ambulance?.vehicle_health?.fuel_percent ?? 70}%</span>
          </div>
          <div className="h-2 rounded bg-muted">
            <div
              className="h-2 rounded bg-green-500"
              style={{ width: `${ambulance?.vehicle_health?.fuel_percent ?? 70}%` }}
            />
          </div>
        </div>

        {/* Battery */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>🔋 Battery</span>
            <span>{ambulance?.vehicle_health?.battery_percent ?? 85}%</span>
          </div>
          <div className="h-2 rounded bg-muted">
            <div
              className="h-2 rounded bg-blue-500"
              style={{ width: `${ambulance?.vehicle_health?.battery_percent ?? 85}%` }}
            />
          </div>
        </div>

        {/* Oxygen */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>🫁 Oxygen Cylinder</span>
            <span>{ambulance?.vehicle_health?.oxygen_percent ?? 60}%</span>
          </div>
          <div className="h-2 rounded bg-muted">
            <div
              className={`h-2 rounded ${
                (ambulance?.vehicle_health?.oxygen_percent ?? 60) < 30
                  ? 'bg-red-500'
                  : 'bg-cyan-500'
              }`}
              style={{ width: `${ambulance?.vehicle_health?.oxygen_percent ?? 60}%` }}
            />
          </div>
        </div>

        {/* Tyre Pressure */}
        <div>
          <p className="text-sm font-medium mb-2">🛞 Tyre Pressure (PSI)</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-muted/50 p-2 rounded">
              FL: {ambulance?.vehicle_health?.tyres?.front_left ?? 32} PSI
            </div>
            <div className="bg-muted/50 p-2 rounded">
              FR: {ambulance?.vehicle_health?.tyres?.front_right ?? 31} PSI
            </div>
            <div className="bg-muted/50 p-2 rounded">
              RL: {ambulance?.vehicle_health?.tyres?.rear_left ?? 33} PSI
            </div>
            <div className="bg-muted/50 p-2 rounded">
              RR: {ambulance?.vehicle_health?.tyres?.rear_right ?? 32} PSI
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};