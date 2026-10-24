// src/pages/hr/Assets.tsx
//
// The asset register. Route: /hr/assets
//
// Guards itself: the database already refuses (assets_list asks
// can_see_all_assets, asset_save asks asset_edit), so this is the
// polite half and it is kept beside the thing it guards.

import HrLayout from '../../components/HrLayout'
import AssetRegister from '../../components/assets/AssetRegister'
import { usePermissions } from '../../lib/permissions'

export default function HrAssetsPage() {
  const { can, ready, isSuper } = usePermissions()

  return (
    <HrLayout>
      {!ready ? (
        <p className="py-16 text-center text-sm text-gray-600">One moment…</p>
      ) : isSuper || can('mod_assets') || can('asset_edit') ? (
        <AssetRegister />
      ) : (
        <div className="mx-auto max-w-md py-20 text-center">
          <h1 className="text-lg font-medium">Assets</h1>
          <p className="mt-2 text-sm text-gray-500">This one is not switched on for you.</p>
        </div>
      )}
    </HrLayout>
  )
}