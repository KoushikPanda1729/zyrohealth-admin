'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Typography, Alert, Spin, Tag, Button, Space, message, Modal, Drawer, Input,
  Select, Switch, Popconfirm,
} from 'antd';
import { PlusOutlined, BankOutlined, EditOutlined, CheckCircleOutlined, StopOutlined, EnvironmentOutlined } from '@ant-design/icons';
import axios from 'axios';
import { apiCall } from '../../../lib/api';
import { getStoredUserRaw } from '../../../lib/session';
import LocationPickerModal, { PickedLocation } from '../../components/maps/LocationPickerModal';

const { Title, Text } = Typography;

interface HospitalRow {
  id: string;
  name: string;
  contactPhone: string;
  addressLine1?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  specialties: string[];
  emergencyServicesAvailable: boolean;
  isActive: boolean;
  createdAt: string;
}

export default function HospitalsPage() {
  const [readOnly, setReadOnly] = useState(false);
  useEffect(() => {
    try {
      const raw = getStoredUserRaw();
      setReadOnly(raw ? JSON.parse(raw).role === 'platform_support' : false);
    } catch { setReadOnly(false); }
  }, []);

  const [hospitals, setHospitals] = useState<HospitalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [name, setName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [latitude, setLatitude] = useState<number | undefined>(undefined);
  const [longitude, setLongitude] = useState<number | undefined>(undefined);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [emergencyServicesAvailable, setEmergencyServicesAvailable] = useState(true);

  const [editing, setEditing] = useState<HospitalRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editName, setEditName] = useState('');
  const [editContactPhone, setEditContactPhone] = useState('');
  const [editAddressLine1, setEditAddressLine1] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editLatitude, setEditLatitude] = useState<number | undefined>(undefined);
  const [editLongitude, setEditLongitude] = useState<number | undefined>(undefined);
  const [editSpecialties, setEditSpecialties] = useState<string[]>([]);
  const [editEmergency, setEditEmergency] = useState(true);

  const [picker, setPicker] = useState<'create' | 'edit' | null>(null);
  const applyPicked = (target: 'create' | 'edit') => (result: PickedLocation) => {
    if (target === 'create') {
      setAddressLine1(result.addressLine1);
      if (result.city) setCity(result.city);
      setLatitude(result.latitude);
      setLongitude(result.longitude);
    } else {
      setEditAddressLine1(result.addressLine1);
      if (result.city) setEditCity(result.city);
      setEditLatitude(result.latitude);
      setEditLongitude(result.longitude);
    }
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall('GET', '/api/admin/hospitals');
      setHospitals(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load hospitals');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const createHospital = async () => {
    if (!name.trim() || !contactPhone.trim()) return;
    setCreateSaving(true);
    try {
      await apiCall('POST', '/api/admin/hospitals', {
        name: name.trim(),
        contactPhone: contactPhone.trim(),
        addressLine1: addressLine1.trim() || undefined,
        city: city.trim() || undefined,
        latitude,
        longitude,
        specialties,
        emergencyServicesAvailable,
      });
      message.success('Hospital added');
      setCreating(false);
      setName(''); setContactPhone(''); setAddressLine1(''); setCity('');
      setLatitude(undefined); setLongitude(undefined);
      setSpecialties([]); setEmergencyServicesAvailable(true);
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to add hospital');
      else message.error('An unexpected error occurred');
    } finally { setCreateSaving(false); }
  };

  const toggleActive = async (hospital: HospitalRow) => {
    setBusyId(hospital.id);
    try {
      await apiCall('PATCH', `/api/admin/hospitals/${hospital.id}`, { isActive: !hospital.isActive });
      message.success(hospital.isActive ? 'Hospital deactivated' : 'Hospital activated');
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to update hospital');
      else message.error('An unexpected error occurred');
    } finally { setBusyId(null); }
  };

  const openEdit = (hospital: HospitalRow) => {
    setEditing(hospital);
    setEditName(hospital.name);
    setEditContactPhone(hospital.contactPhone);
    setEditAddressLine1(hospital.addressLine1 ?? '');
    setEditCity(hospital.city ?? '');
    setEditLatitude(hospital.latitude);
    setEditLongitude(hospital.longitude);
    setEditSpecialties(hospital.specialties ?? []);
    setEditEmergency(hospital.emergencyServicesAvailable);
  };

  const saveEdit = async () => {
    if (!editing || !editName.trim() || !editContactPhone.trim()) return;
    setEditSaving(true);
    try {
      await apiCall('PATCH', `/api/admin/hospitals/${editing.id}`, {
        name: editName.trim(),
        contactPhone: editContactPhone.trim(),
        addressLine1: editAddressLine1.trim() || undefined,
        city: editCity.trim() || undefined,
        latitude: editLatitude,
        longitude: editLongitude,
        specialties: editSpecialties,
        emergencyServicesAvailable: editEmergency,
      });
      message.success('Hospital updated');
      setEditing(null);
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to update hospital');
      else message.error('An unexpected error occurred');
    } finally { setEditSaving(false); }
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Phone', dataIndex: 'contactPhone', key: 'contactPhone' },
    { title: 'City', dataIndex: 'city', key: 'city', render: (v?: string) => v || '—' },
    {
      title: 'Specialties', dataIndex: 'specialties', key: 'specialties',
      render: (v: string[]) => v?.length ? v.map((s) => <Tag key={s}>{s}</Tag>) : '—',
    },
    {
      title: 'Emergency', dataIndex: 'emergencyServicesAvailable', key: 'emergencyServicesAvailable',
      render: (v: boolean) => v ? <Tag color="red">24/7</Tag> : <Tag>No</Tag>,
    },
    {
      title: 'Status', key: 'status',
      render: (_: unknown, h: HospitalRow) => (
        h.isActive
          ? <Tag icon={<CheckCircleOutlined />} color="green">Active</Tag>
          : <Tag color="default">Inactive</Tag>
      ),
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, h: HospitalRow) => (
        <Space>
          {!readOnly && <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(h)}>Edit</Button>}
          {!readOnly && (
            <Popconfirm
              title={h.isActive ? 'Deactivate this hospital?' : 'Activate this hospital?'}
              onConfirm={() => toggleActive(h)}
            >
              <Button size="small" danger={h.isActive} icon={h.isActive ? <StopOutlined /> : <CheckCircleOutlined />} loading={busyId === h.id}>
                {h.isActive ? 'Deactivate' : 'Activate'}
              </Button>
            </Popconfirm>
          )}
          {readOnly && <Text type="secondary" style={{ fontSize: 12 }}>View only</Text>}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <BankOutlined style={{ marginRight: 8 }} />Hospitals
        </Title>
        {!readOnly && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>Add Hospital</Button>
        )}
      </div>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {hospitals.length === 0 && !loading && !error && (
        <Alert
          type="info"
          showIcon
          message="No hospitals yet"
          description="Add a hospital to your directory — patients can browse it in the app regardless of which tenant they belong to."
          style={{ marginBottom: 16 }}
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>
      ) : (
        <Table columns={columns} dataSource={hospitals.map((h) => ({ ...h, key: h.id }))} bordered size="middle" scroll={{ x: 'max-content' }} />
      )}

      <Drawer
        title={<span><BankOutlined style={{ marginRight: 8, color: '#1677ff' }} />Add Hospital</span>}
        placement="right"
        open={creating}
        onClose={() => setCreating(false)}
        size={420}
        destroyOnClose
        footer={
          <Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button
              type="primary"
              loading={createSaving}
              disabled={!name.trim() || !contactPhone.trim()}
              onClick={createHospital}
            >
              Create
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong style={{ fontSize: 13 }}>Hospital name</Text>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. City General Hospital" style={{ marginTop: 4 }} autoFocus />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Contact phone</Text>
            <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+91..." style={{ marginTop: 4 }} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text strong style={{ fontSize: 13 }}>Address</Text>
              <Button size="small" icon={<EnvironmentOutlined />} onClick={() => setPicker('create')}>
                Pick on map
              </Button>
            </div>
            <Input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>City</Text>
            <Input value={city} onChange={(e) => setCity(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          {latitude != null && longitude != null && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              <EnvironmentOutlined /> {latitude.toFixed(5)}, {longitude.toFixed(5)}
            </Text>
          )}
          <div>
            <Text strong style={{ fontSize: 13 }}>Specialties</Text>
            <Select
              mode="tags"
              value={specialties}
              onChange={setSpecialties}
              style={{ width: '100%', marginTop: 4 }}
              placeholder="e.g. Cardiology, Trauma, Pediatrics"
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Switch checked={emergencyServicesAvailable} onChange={setEmergencyServicesAvailable} />
            <Text style={{ fontSize: 13 }}>24/7 emergency services available</Text>
          </div>
        </Space>
      </Drawer>

      <Modal
        title="Edit Hospital"
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={saveEdit}
        okText="Save"
        confirmLoading={editSaving}
        okButtonProps={{ disabled: !editName.trim() || !editContactPhone.trim() }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong style={{ fontSize: 13 }}>Hospital name</Text>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Contact phone</Text>
            <Input value={editContactPhone} onChange={(e) => setEditContactPhone(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text strong style={{ fontSize: 13 }}>Address</Text>
              <Button size="small" icon={<EnvironmentOutlined />} onClick={() => setPicker('edit')}>
                Pick on map
              </Button>
            </div>
            <Input value={editAddressLine1} onChange={(e) => setEditAddressLine1(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>City</Text>
            <Input value={editCity} onChange={(e) => setEditCity(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          {editLatitude != null && editLongitude != null && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              <EnvironmentOutlined /> {editLatitude.toFixed(5)}, {editLongitude.toFixed(5)}
            </Text>
          )}
          <div>
            <Text strong style={{ fontSize: 13 }}>Specialties</Text>
            <Select mode="tags" value={editSpecialties} onChange={setEditSpecialties} style={{ width: '100%', marginTop: 4 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Switch checked={editEmergency} onChange={setEditEmergency} />
            <Text style={{ fontSize: 13 }}>24/7 emergency services available</Text>
          </div>
        </Space>
      </Modal>

      <LocationPickerModal
        open={picker !== null}
        onClose={() => setPicker(null)}
        onSelect={applyPicked(picker ?? 'create')}
        initialLat={picker === 'edit' ? editLatitude : latitude}
        initialLng={picker === 'edit' ? editLongitude : longitude}
      />
    </div>
  );
}
