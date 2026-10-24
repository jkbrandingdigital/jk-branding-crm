// src/pages/admin/Assets.tsx
//
// The asset register, in the admin area. Route: /admin/assets
// The same register HR uses — one screen, two doors.

import AdminLayout from '../../components/AdminLayout'
import AssetRegister from '../../components/assets/AssetRegister'

export default function AdminAssetsPage() {
  return (
    <AdminLayout>
      <AssetRegister />
    </AdminLayout>
  )
}