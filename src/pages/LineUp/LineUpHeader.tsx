import React from 'react'
import { createPortal } from 'react-dom'
import {
  Truck, CalendarDays, Wrench, ClipboardList, Maximize2, Plus, Check, X,
  Trash2, Upload
} from 'lucide-react'
import type { BranchTheme, ConfirmModalState } from './types'

interface LineUpHeaderProps {
  activeTab: 'field' | 'weekly' | 'vehicles'
  setActiveTab: (t: 'field' | 'weekly' | 'vehicles') => void
  date: string
  setDate: (d: string) => void
  desktopDateInputRef: React.RefObject<HTMLInputElement | null>
  showcaseOpen: boolean
  setShowcaseOpen: (o: boolean) => void
  canEdit: boolean
  currentTheme: BranchTheme
  isLight: boolean
  cardBg: string
  border: string
  textPrimary: string
  textMuted: string
  inputBg: string
  inputBorder: string
  autoSyncSchedule?: boolean
  setAutoSyncSchedule?: (val: boolean) => void
  handleSyncFromSchedule: () => void
  handleAddRow: () => void
  toast: { message: string; type: 'success' | 'error' | 'info' } | null
  setToast: (t: { message: string; type: 'success' | 'error' | 'info' } | null) => void
  confirmModal: ConfirmModalState | null
  setConfirmModal: (m: ConfirmModalState | null) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  scanFileRef: React.RefObject<HTMLInputElement | null>
  handleImportExcel: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleScanFile: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export const LineUpHeader: React.FC<LineUpHeaderProps> = ({
  activeTab,
  setActiveTab,
  date,
  setDate,
  desktopDateInputRef,
  showcaseOpen,
  setShowcaseOpen,
  canEdit,
  currentTheme,
  isLight,
  border,
  textPrimary,
  textMuted,
  inputBg,
  inputBorder,
  autoSyncSchedule = false,
  setAutoSyncSchedule,
  handleSyncFromSchedule,
  handleAddRow,
  toast,
  setToast,
  confirmModal,
  setConfirmModal,
  fileInputRef,
  scanFileRef,
  handleImportExcel,
  handleScanFile,
}) => {
  return (
    <>
      {/* ── Single-line header: tabs + (Daily only) date/Showcase/Sync/Add Row ── */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div
          className="inline-flex p-1.5 rounded-xl shadow-inner gap-1 max-w-full overflow-x-auto no-scrollbar"
          style={{ backgroundColor: isLight ? '#f1f5f9' : '#030712', border: `1px solid ${isLight ? '#e2e8f0' : '#1e293b'}` }}
        >
          {([
            { id: 'field', label: 'Daily Schedule', icon: <Truck className="w-3.5 h-3.5" /> },
            { id: 'weekly', label: 'Weekly Schedule', icon: <CalendarDays className="w-3.5 h-3.5" /> },
            { id: 'vehicles', label: 'Vehicles', icon: <Wrench className="w-3.5 h-3.5" /> },
          ] as const).map(tab => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold whitespace-nowrap transition-colors border outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 ${
                  active
                    ? isLight
                      ? 'bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] border-slate-200 text-slate-900'
                      : 'bg-gradient-to-b from-slate-700 to-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.4)] border-slate-600 text-white'
                    : isLight
                    ? 'text-slate-500 hover:text-slate-900 font-medium border-transparent'
                    : 'text-slate-400 hover:text-white font-medium border-transparent'
                }`}
                style={{ ['--tw-ring-color' as any]: currentTheme.accent }}
              >
                {tab.icon}
                {tab.label}
              </button>
            )
          })}
        </div>

        {activeTab === 'field' && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Date */}
            <div
              onClick={() => { desktopDateInputRef.current?.showPicker?.() }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
              style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
            >
              <ClipboardList className="w-3.5 h-3.5" style={{ color: currentTheme.accent }} />
              <input
                ref={desktopDateInputRef}
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="date-input-no-indicator date-input-trigger-only bg-transparent outline-none text-xs font-bold cursor-pointer"
                style={{ color: textPrimary }}
              />
            </div>

            {/* Showcase */}
            <button
              type="button"
              onClick={() => setShowcaseOpen(!showcaseOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] md:text-xs font-bold transition-all cursor-pointer"
              style={{
                backgroundColor: showcaseOpen ? 'transparent' : '#16a34a',
                border: '2px solid #16a34a',
                color: showcaseOpen ? '#16a34a' : '#ffffff',
                boxShadow: showcaseOpen ? 'none' : '0 2px 8px rgba(22,163,74,0.35)',
              }}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              {showcaseOpen ? 'Exit Showcase' : 'Showcase'}
            </button>

            {!showcaseOpen && canEdit && (
              <>
                {/* Auto-Sync Schedule Toggle */}
                {setAutoSyncSchedule && (
                  <button
                    type="button"
                    onClick={() => setAutoSyncSchedule(!autoSyncSchedule)}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer select-none"
                    style={{
                      backgroundColor: autoSyncSchedule ? `${currentTheme.accent}18` : inputBg,
                      border: `1px solid ${autoSyncSchedule ? currentTheme.accent : inputBorder}`,
                      color: autoSyncSchedule ? currentTheme.accent : textMuted,
                    }}
                    title={
                      autoSyncSchedule
                        ? 'Auto-Sync Schedule is ON: automatically loads and derives rows from today\'s Schedules tickets'
                        : 'Auto-Sync Schedule is OFF: loads your saved Lineup rows directly without clobbering'
                    }
                  >
                    <div
                      className={`w-6 h-3.5 rounded-full transition-colors relative flex items-center ${
                        autoSyncSchedule ? 'bg-emerald-500' : 'bg-slate-400/40'
                      }`}
                    >
                      <div
                        className={`w-2.5 h-2.5 rounded-full bg-white transition-transform ${
                          autoSyncSchedule ? 'translate-x-3' : 'translate-x-0.5'
                        }`}
                      />
                    </div>
                    <span>Auto Sync Sched</span>
                  </button>
                )}

                {/* Sync from Schedule */}
                <button
                  type="button"
                  onClick={handleSyncFromSchedule}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs transition-all hover:scale-105 cursor-pointer"
                  style={{ color: currentTheme.accent, border: `1px solid ${currentTheme.accent}30`, backgroundColor: `${currentTheme.accent}08` }}
                >
                  <ClipboardList className="w-4 h-4" /> Sync from Schedule
                </button>

                {/* Add Row */}
                <button
                  type="button"
                  onClick={handleAddRow}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs text-white transition-all hover:scale-105 cursor-pointer"
                  style={{
                    background: `linear-gradient(135deg, ${currentTheme.accent}, ${currentTheme.accentDark})`,
                    boxShadow: `0 4px 12px ${currentTheme.accent}20`,
                  }}
                >
                  <Plus className="w-4 h-4" /> Add Row
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Toast — portalled to body so it always clears the sticky header ── */}
      {createPortal(
        <div
          style={{
            position: 'fixed',
            top: toast ? '20px' : '-80px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 99999,
            opacity: toast ? 1 : 0,
            pointerEvents: toast ? 'auto' : 'none',
            transition: 'top 0.28s cubic-bezier(0.34,1.56,0.64,1), opacity 0.22s ease',
          }}
        >
          {toast && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                borderRadius: '14px',
                backgroundColor: isLight ? '#ffffff' : '#1E293B',
                border: `1px solid ${
                  toast.type === 'success' ? 'rgba(16,185,129,0.4)'
                    : toast.type === 'error' ? 'rgba(239,68,68,0.4)'
                    : 'rgba(59,130,246,0.4)'
                }`,
                boxShadow: '0 12px 40px -8px rgba(0,0,0,0.22)',
                minWidth: '220px',
                maxWidth: '400px',
              }}
            >
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  backgroundColor: toast.type === 'success' ? 'rgba(16,185,129,0.12)'
                    : toast.type === 'error' ? 'rgba(239,68,68,0.12)'
                    : 'rgba(59,130,246,0.12)',
                }}
              >
                {toast.type === 'success' && <Check style={{ width: '13px', height: '13px', color: '#10B981' }} />}
                {toast.type === 'error' && <X style={{ width: '13px', height: '13px', color: '#EF4444' }} />}
                {toast.type === 'info' && <Check style={{ width: '13px', height: '13px', color: '#3B82F6' }} />}
              </div>
              <span style={{ fontSize: '12px', fontWeight: 600, flex: 1, color: isLight ? '#0f172a' : '#E2E8F0' }}>{toast.message}</span>
              <button
                onClick={() => setToast(null)}
                style={{ flexShrink: 0, marginLeft: '4px', opacity: 0.4, cursor: 'pointer', background: 'none', border: 'none', padding: 0, display: 'flex' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}
              >
                <X style={{ width: '12px', height: '12px', color: isLight ? '#0f172a' : '#E2E8F0' }} />
              </button>
            </div>
          )}
        </div>,
        document.body
      )}

      {/* Always-in-DOM hidden inputs */}
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
      <input ref={scanFileRef} type="file" accept="image/*" className="hidden" onChange={handleScanFile} />

      {/* ── Confirm Modal ── */}
      {confirmModal && (
        <div
          className="fixed inset-0 z-[11000] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
          onClick={() => setConfirmModal(null)}
        >
          <div
            className="rounded-2xl shadow-2xl flex flex-col gap-0 overflow-hidden"
            style={{
              backgroundColor: isLight ? '#ffffff' : '#1E293B',
              border: `1px solid ${
                confirmModal.type === 'danger'
                  ? 'rgba(239,68,68,0.25)'
                  : confirmModal.type === 'warning'
                  ? 'rgba(245,158,11,0.25)'
                  : 'rgba(59,130,246,0.25)'
              }`,
              width: '100%',
              maxWidth: '380px',
              margin: '0 20px',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Accent bar */}
            <div
              style={{
                height: '3px',
                background:
                  confirmModal.type === 'danger'
                    ? 'linear-gradient(90deg, #EF4444, #F87171)'
                    : confirmModal.type === 'warning'
                    ? 'linear-gradient(90deg, #F59E0B, #FCD34D)'
                    : 'linear-gradient(90deg, #3B82F6, #60A5FA)',
              }}
            />

            {/* Body */}
            <div className="px-6 py-5 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    backgroundColor:
                      confirmModal.type === 'danger'
                        ? 'rgba(239,68,68,0.1)'
                        : confirmModal.type === 'warning'
                        ? 'rgba(245,158,11,0.1)'
                        : 'rgba(59,130,246,0.1)',
                  }}
                >
                  {confirmModal.type === 'danger' && <Trash2 className="w-4 h-4" style={{ color: '#EF4444' }} />}
                  {confirmModal.type === 'warning' && <ClipboardList className="w-4 h-4" style={{ color: '#F59E0B' }} />}
                  {confirmModal.type === 'info' && <Upload className="w-4 h-4" style={{ color: '#3B82F6' }} />}
                  {!confirmModal.type && <Check className="w-4 h-4" style={{ color: '#10B981' }} />}
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <p className="text-sm font-black" style={{ color: textPrimary }}>{confirmModal.title}</p>
                  <p className="text-xs leading-relaxed" style={{ color: textMuted }}>{confirmModal.message}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1 justify-end">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold transition-colors hover:opacity-80 cursor-pointer"
                  style={{
                    backgroundColor: isLight ? '#F1F5F9' : '#0F172A',
                    color: textMuted,
                    border: `1px solid ${border}`,
                  }}
                >
                  {confirmModal.cancelText ?? 'Cancel'}
                </button>
                <button
                  onClick={() => {
                    confirmModal.onConfirm()
                    setConfirmModal(null)
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 active:scale-95 cursor-pointer"
                  style={{
                    background:
                      confirmModal.type === 'danger'
                        ? 'linear-gradient(135deg, #EF4444, #DC2626)'
                        : confirmModal.type === 'warning'
                        ? 'linear-gradient(135deg, #F59E0B, #D97706)'
                        : 'linear-gradient(135deg, #3B82F6, #2563EB)',
                  }}
                >
                  {confirmModal.confirmText ?? 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
