import { ref, onValue, off } from 'firebase/database';
import { rtdb } from './firebase';

export interface VehicleLocation {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
  driverId: string;
}

/**
 * Subscribes to a specific vehicle's location updates.
 */
export function subscribeToVehicleLocation(driverId: string, callback: (location: VehicleLocation | null) => void): () => void {
  if (!rtdb) {
    console.warn('Cannot subscribe to location: Firebase RTDB not initialized.');
    return () => {};
  }

  const locationRef = ref(rtdb, `vehicles/${driverId}/location`);
  const unsubscribe = onValue(locationRef, (snapshot) => {
    const data = snapshot.val();
    callback(data as VehicleLocation | null);
  }, (error) => {
    console.error('Firebase subscription error:', error);
  });

  return () => off(locationRef, 'value', unsubscribe);
}

/**
 * Subscribes to all active vehicles' locations (for coordinators).
 */
export function subscribeToAllVehicles(callback: (locations: Record<string, VehicleLocation>) => void): () => void {
  if (!rtdb) {
    console.warn('Cannot subscribe to all vehicles: Firebase RTDB not initialized.');
    return () => {};
  }

  const vehiclesRef = ref(rtdb, 'vehicles');
  const unsubscribe = onValue(vehiclesRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback({});
      return;
    }
    
    // Parse /vehicles/{driverId}/location
    const parsed: Record<string, VehicleLocation> = {};
    Object.keys(data).forEach(driverId => {
      if (data[driverId]?.location) {
        parsed[driverId] = data[driverId].location;
      }
    });
    
    callback(parsed);
  });

  return () => off(vehiclesRef, 'value', unsubscribe);
}
