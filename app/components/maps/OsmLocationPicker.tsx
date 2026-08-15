'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AutoComplete, Button, Space, Typography, Spin, message } from 'antd';
import { AimOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { reverseGeocode, searchPlaces, SearchResult } from './geocoding';
import type { PickedLocation } from './LocationPickerModal';

const { Text } = Typography;

// Leaflet's default marker icon path breaks under bundlers (webpack/
// turbopack rewrite the asset URLs it hardcodes) — point it at the CDN
// copies instead, the standard workaround for react-leaflet.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const DEFAULT_CENTER: [number, number] = [19.076, 72.8777]; // Mumbai — sensible default for this deployment's data

interface OsmLocationPickerProps {
  initialLat?: number;
  initialLng?: number;
  onConfirm: (result: PickedLocation) => void;
}

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function OsmLocationPicker({
  initialLat,
  initialLng,
  onConfirm,
}: OsmLocationPickerProps) {
  const hasInitial = initialLat != null && initialLng != null;
  const [position, setPosition] = useState<[number, number] | null>(
    hasInitial ? [initialLat, initialLng] : null,
  );
  const [resolved, setResolved] = useState<{ addressLine1?: string; city?: string; label: string } | null>(
    null,
  );
  const [resolving, setResolving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOptions, setSearchOptions] = useState<SearchResult[]>([]);

  const resolveAddress = async (lat: number, lng: number) => {
    setResolving(true);
    try {
      const addr = await reverseGeocode(lat, lng);
      setResolved({ addressLine1: addr.addressLine1, city: addr.city, label: addr.displayName });
    } catch {
      setResolved(null);
      message.error('Could not resolve an address for that point — you can still confirm the coordinates.');
    } finally {
      setResolving(false);
    }
  };

  useEffect(() => {
    if (hasInitial) void resolveAddress(initialLat, initialLng);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (lat: number, lng: number) => {
    setPosition([lat, lng]);
    void resolveAddress(lat, lng);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      message.error('Geolocation is not available in this browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => pick(pos.coords.latitude, pos.coords.longitude),
      () => message.error('Could not get your current location'),
    );
  };

  const handleSearch = async (value: string) => {
    setSearchQuery(value);
    if (value.trim().length < 3) {
      setSearchOptions([]);
      return;
    }
    try {
      setSearchOptions(await searchPlaces(value));
    } catch {
      setSearchOptions([]);
    }
  };

  const handleSelectSearch = (_: string, option: { result: SearchResult }) => {
    const r = option.result;
    setSearchQuery(r.displayName);
    setPosition([r.latitude, r.longitude]);
    setResolved({ addressLine1: r.addressLine1, city: r.city, label: r.displayName });
  };

  const confirm = () => {
    if (!position) {
      message.error('Pick a location on the map first');
      return;
    }
    onConfirm({
      addressLine1: resolved?.addressLine1 || resolved?.label || '',
      city: resolved?.city,
      latitude: position[0],
      longitude: position[1],
    });
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Space.Compact style={{ width: '100%' }}>
        <AutoComplete
          style={{ width: '100%' }}
          value={searchQuery}
          onChange={setSearchQuery}
          onSearch={handleSearch}
          onSelect={(v, o) => handleSelectSearch(v, o as unknown as { result: SearchResult })}
          options={searchOptions.map((r) => ({
            value: r.displayName,
            label: r.displayName,
            result: r,
          }))}
          placeholder="Search for an address or place..."
        />
        <Button icon={<AimOutlined />} onClick={useMyLocation}>Use my location</Button>
      </Space.Compact>

      <div style={{ height: 360, borderRadius: 8, overflow: 'hidden' }}>
        <MapContainer
          center={position ?? DEFAULT_CENTER}
          zoom={position ? 15 : 12}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToPlace onPick={pick} />
          {position && (
            <Marker
              position={position}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const m = e.target.getLatLng();
                  pick(m.lat, m.lng);
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <div style={{ minHeight: 22 }}>
        {resolving ? (
          <Space size={6}><Spin size="small" /><Text type="secondary" style={{ fontSize: 12 }}>Resolving address...</Text></Space>
        ) : position ? (
          <Space size={6} align="start">
            <EnvironmentOutlined style={{ color: '#1677ff', marginTop: 2 }} />
            <Text style={{ fontSize: 12 }}>
              {resolved?.label || `${position[0].toFixed(5)}, ${position[1].toFixed(5)}`}
            </Text>
          </Space>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>Click the map, search, or use your current location to drop a pin.</Text>
        )}
      </div>

      <Button type="primary" block disabled={!position} onClick={confirm}>
        Confirm Location
      </Button>
    </Space>
  );
}
