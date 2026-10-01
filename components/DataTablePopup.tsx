import { useState } from 'react';
import { X, Server, Network, Shield, LayoutGrid, AlertCircle } from 'lucide-react';
import { classifyTraffic } from '@/lib/paloalto-import';

interface DataTablePopupProps {
  topologyData: any;
  onClose: () => void;
  ruleConflicts?: any;
}

export function DataTablePopup({ topologyData, onClose, ruleConflicts = {} }: DataTablePopupProps) {
  const [activeTab, setActiveTab] = useState<'zones' | 'networks' | 'clients' | 'rules'>('zones');

  // Flatten topology data
  const zones = topologyData?.zones || [];
  
  const networks = zones.flatMap((z: any) => 
    (z.networks || []).map((n: any) => ({ ...n, zoneName: z.name }))
  );
  
  const clients = networks.flatMap((n: any) => 
    (n.clients || []).map((c: any) => ({ ...c, networkName: n.name, zoneName: n.zoneName }))
  );
  
  const rules = topologyData?.rules || [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl w-full max-w-6xl h-[80vh] flex flex-col border border-gray-200 dark:border-gray-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-blue-500" />
            Data View
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 px-6 bg-white dark:bg-gray-900">
          <TabButton
            active={activeTab === 'zones'}
            onClick={() => setActiveTab('zones')}
            icon={<LayoutGrid className="w-4 h-4" />}
            label={`Zones (${zones.length})`}
          />
          <TabButton
            active={activeTab === 'networks'}
            onClick={() => setActiveTab('networks')}
            icon={<Network className="w-4 h-4" />}
            label={`Networks (${networks.length})`}
          />
          <TabButton
            active={activeTab === 'clients'}
            onClick={() => setActiveTab('clients')}
            icon={<Server className="w-4 h-4" />}
            label={`Clients (${clients.length})`}
          />
          <TabButton
            active={activeTab === 'rules'}
            onClick={() => setActiveTab('rules')}
            icon={<Shield className="w-4 h-4" />}
            label={`Rules (${rules.length})`}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 bg-gray-50/50 dark:bg-gray-950/50">
          {activeTab === 'zones' && (
            <Table
              columns={['ID', 'Name', 'Description', 'Color', 'Created At']}
              data={zones}
              renderRow={(z) => [
                <span className="font-mono text-xs">{z.id}</span>,
                <span className="font-medium">{z.name}</span>,
                z.description || '-',
                z.color ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: z.color }}></div>
                    <span className="text-xs uppercase">{z.color}</span>
                  </div>
                ) : '-',
                new Date(z.createdAt).toLocaleString()
              ]}
            />
          )}

          {activeTab === 'networks' && (
            <Table
              columns={['ID', 'Name', 'Zone', 'CIDR', 'Client Isolation', 'Created At']}
              data={networks}
              renderRow={(n) => [
                <span className="font-mono text-xs">{n.id}</span>,
                <span className="font-medium">{n.name}</span>,
                <span className="text-blue-600 dark:text-blue-400">{n.zoneName}</span>,
                <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm">{n.cidr || '-'}</span>,
                n.clientIsolation ? 'Yes' : 'No',
                new Date(n.createdAt).toLocaleString()
              ]}
            />
          )}

          {activeTab === 'clients' && (
            <Table
              columns={['ID', 'Name', 'Network', 'Zone', 'IP', 'Created At']}
              data={clients}
              renderRow={(c) => [
                <span className="font-mono text-xs">{c.id}</span>,
                <span className="font-medium">{c.name}</span>,
                c.networkName,
                c.zoneName,
                <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm">{c.ip || '-'}</span>,
                new Date(c.createdAt).toLocaleString()
              ]}
            />
          )}

          {activeTab === 'rules' && (
            <Table
              columns={['ID', 'Action', 'Priority', 'Description', 'Services', 'Applications', 'Active', 'Status', 'Created At']}
              data={rules}
              renderRow={(r) => {
                const conflict = ruleConflicts[r.id];
                const isFullyShadowed = conflict?.isFullyShadowed;
                const isPartiallyShadowed = conflict?.shadowedPorts?.length > 0 && !isFullyShadowed;
                const traffic = classifyTraffic(r.ports || '');
                const list = (items: string[]) => items.length ? items.join(', ') : 'any';

                return [
                <span className={`font-mono text-xs ${isFullyShadowed ? 'opacity-50' : ''}`}>{r.id}</span>,
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  r.action === 'ALLOW' 
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                } ${isFullyShadowed ? 'opacity-50' : ''}`}>
                  {r.action}
                </span>,
                <span className={isFullyShadowed ? 'opacity-50' : ''}>{r.priority}</span>,
                <span className={isFullyShadowed ? 'opacity-50' : ''}>{r.description || '-'}</span>,
                <div className={`flex items-center gap-1 font-mono ${isFullyShadowed ? 'opacity-50' : ''}`}>
                  {list([...traffic.ports, ...traffic.services])}
                  {isPartiallyShadowed && (
                    <div className="relative group inline-flex">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500 cursor-help" />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block w-max bg-gray-800 text-white text-xs rounded px-2 py-1 z-10 whitespace-normal max-w-xs font-sans font-normal">
                         {conflict.shadowingRuleNames.join(', ')} covers {conflict.shadowedPorts.join(', ')}
                      </div>
                    </div>
                  )}
                </div>,
                <span className={isFullyShadowed ? 'opacity-50' : ''}>{list(traffic.applications)}</span>,
                <span className={isFullyShadowed ? 'opacity-50' : ''}>{r.active ? 'Yes' : 'No'}</span>,
                <div className="flex items-center gap-1">
                  {isFullyShadowed ? (
                    <span className="text-xs text-red-500 font-medium flex items-center gap-1 cursor-help group relative">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Shadowed
                      <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block w-max bg-gray-800 text-white text-xs rounded px-2 py-1 z-10 whitespace-normal max-w-xs font-normal">
                         Shadowed by {conflict.shadowingRuleNames.join(', ')}
                      </div>
                    </span>
                  ) : r.active ? (
                    <span className="text-xs text-green-500 font-medium">Active</span>
                  ) : (
                    <span className="text-xs text-gray-500 font-medium">Disabled</span>
                  )}
                </div>,
                <span className={isFullyShadowed ? 'opacity-50' : ''}>{new Date(r.createdAt).toLocaleString()}</span>
              ]}}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
          : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Table({ columns, data, renderRow }: { columns: string[]; data: any[]; renderRow: (item: any) => React.ReactNode[] }) {
  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        No data available
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300">
            <tr>
              {columns.map((col, i) => (
                <th key={i} className="px-4 py-3 font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800 text-gray-700 dark:text-gray-300">
            {data.map((item, rowIndex) => (
              <tr key={item.id || rowIndex} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                {renderRow(item).map((cell, colIndex) => (
                  <td key={colIndex} className="px-4 py-3">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
