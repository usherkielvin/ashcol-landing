import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { subscribeToVehicleLocation, subscribeToAllVehicles } from '../services/locationService';
import type { VehicleLocation } from '../services/locationService';

// Fix leaflet default icon
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom vehicle icon
const vehicleIcon = L.divIcon({
  className: 'custom-vehicle-icon',
  html: `<div style="background-color: #3B82F6; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3" ry="3"></rect><path d="M3 10h18"></path><path d="M7 15h.01"></path><path d="M17 15h.01"></path></svg>
         </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

// Component to handle auto-centering when a single driver is tracked
function LocationUpdater({ location }: { location: VehicleLocation | null }) {
  const map = useMap();
  useEffect(() => {
    if (location) {
      map.flyTo([location.lat, location.lng], 15, { animate: true });
    }
  }, [location, map]);
  return null;
}

interface FleetMapProps {
  driverId?: string; // If provided, shows single vehicle. If missing, shows fleet.
}

export default function FleetMap({ driverId }: FleetMapProps) {
  const [vehicle, setVehicle] = useState<VehicleLocation | null>(null);
  const [fleet, setFleet] = useState<Record<string, VehicleLocation>>({});

  useEffect(() => {
    if (driverId) {
      const unsub = subscribeToVehicleLocation(driverId, (loc) => {
        setVehicle(loc);
      });
      return unsub;
    } else {
      const unsub = subscribeToAllVehicles((locs) => {
        setFleet(locs);
      });
      return unsub;
    }
  }, [driverId]);

  const defaultCenter: [number, number] = [14.5995, 120.9842]; // Manila

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <MapContainer 
        center={defaultCenter} 
        zoom={12} 
        style={{ height: '100%', width: '100%', borderRadius: 'inherit' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />

        {driverId && vehicle && (
          <>
            <LocationUpdater location={vehicle} />
            <Marker position={[vehicle.lat, vehicle.lng]} icon={vehicleIcon}>
              <Popup>
                Driver: {driverId}<br />
                Speed: {vehicle.speed ? Math.round(vehicle.speed * 3.6) : 0} km/h
              </Popup>
            </Marker>
          </>
        )}

        {!driverId && Object.entries(fleet).map(([dId, loc]) => (
          <Marker key={dId} position={[loc.lat, loc.lng]} icon={vehicleIcon}>
            <Popup>
              Driver: {dId}<br />
              Speed: {loc.speed ? Math.round(loc.speed * 3.6) : 0} km/h
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      
      {driverId && !vehicle && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          backgroundColor: 'rgba(0,0,0,0.7)', color: 'white', padding: '8px 16px', borderRadius: '20px', zIndex: 1000,
          fontWeight: 500, fontSize: '14px'
        }}>
          Waiting for GPS signal...
        </div>
      )}
    </div>
  );
}
