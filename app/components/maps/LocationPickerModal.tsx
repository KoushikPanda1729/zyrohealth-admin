'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Modal, Alert, Spin } from 'antd';
import { env } from '../../../lib/env';

const OsmLocationPicker = dynamic(() => import('./OsmLocationPicker'), {
  ssr: false,
  loading: () => (
    <div style={{ height: 420, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spin />
    </div>
  ),
});

export interface PickedLocation {
  addressLine1: string;
  city?: string;
  latitude: number;
  longitude: number;
}

interface LocationPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (result: PickedLocation) => void;
  initialLat?: number;
  initialLng?: number;
}

// Single call site every "pick an address" form uses. The provider is a
// config switch (env.MAP_PROVIDER, see lib/env.ts) — today only 'osm' is
// implemented, so flipping providers later means adding a sibling
// component here, not touching the forms that use this modal.
export default function LocationPickerModal({
  open,
  onClose,
  onSelect,
  initialLat,
  initialLng,
}: LocationPickerModalProps) {
  return (
    <Modal title="Pick a location" open={open} onCancel={onClose} footer={null} width={640} destroyOnClose>
      {env.MAP_PROVIDER === 'osm' ? (
        <OsmLocationPicker
          initialLat={initialLat}
          initialLng={initialLng}
          onConfirm={(result) => {
            onSelect(result);
            onClose();
          }}
        />
      ) : (
        <Alert
          type="warning"
          showIcon
          message="Google Maps isn't configured"
          description="Set NEXT_PUBLIC_MAP_PROVIDER=osm (or wire up a Google Maps implementation) to use the location picker."
        />
      )}
    </Modal>
  );
}
