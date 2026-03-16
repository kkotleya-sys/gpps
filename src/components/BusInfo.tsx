import { BusWithDriver } from '../types';
import { BusProfile } from './BusProfile';
import { useAuth } from '../contexts/AuthContext';

interface BusInfoProps {
  bus: BusWithDriver;
  userLocation: { lat: number; lng: number } | null;
  onClose: () => void;
}

export function BusInfo({ bus, userLocation, onClose }: BusInfoProps) {
  const { profile } = useAuth();
  const isDriver = profile?.bus_number === bus.bus_number;
  void userLocation;

  return (
    <BusProfile bus={bus} onClose={onClose} isDriver={isDriver} />
  );
}


