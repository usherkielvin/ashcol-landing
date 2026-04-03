/**
 * Web Portal Create Ticket Page
 *
 * Clean form for submitting a new service request.
 * Redirects to /tickets on success.
 */

/// <reference types="vite/client" />

import { Send, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERVICE_TYPES = ['Cleaning', 'Maintenance', 'Repair', 'Installation'] as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WebCreateTicketPage(): React.ReactElement {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const [serviceType, setServiceType] = useState('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [contactPhone, setContactPhone] = useState(user?.phone ?? '')
  const [preferredDate, setPreferredDate] = useState('')

  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (!serviceType) next.serviceType = 'Please select a service type.'
    if (!description.trim()) next.description = 'Description is required.'
    if (description.trim().length < 10) next.description = 'Please describe the issue in more detail (at least 10 characters).'
    if (!address.trim()) next.address = 'Service address is required.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    setSubmitError(null)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'

      const res = await fetch(`${apiUrl}/tickets`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          title: `${serviceType} service`,
          description: description.trim(),
          serviceType: serviceType,
          location: address.trim(),
          contactPhone: contactPhone.trim() || undefined,
          preferredDate: preferredDate || undefined,
        })
      })
      
      if (!res.ok) throw new Error('Failed to submit ticket')
      navigate('/tickets')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit ticket. Please try again.'
      setSubmitError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto pb-10">
      <div className="max-w-[680px] mx-auto space-y-5">

        {/* ── Service Type ── */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Service Type <span className="text-red-500">*</span>
          </label>
          <div className="flex flex-wrap gap-2.5">
            {SERVICE_TYPES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setServiceType(s)
                  if (errors.serviceType) setErrors((p) => ({ ...p, serviceType: '' }))
                }}
                className={`px-5 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all ${
                  serviceType === s
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          {errors.serviceType && <p className="text-sm text-red-500">{errors.serviceType}</p>}
        </div>

        {/* ── Description ── */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            className={`w-full min-h-[120px] bg-white dark:bg-gray-800 border-2 rounded-lg px-3.5 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none transition-all ${
              errors.description ? 'border-red-500' : 'border-gray-200 dark:border-gray-700 focus:border-emerald-500'
            }`}
            placeholder="Describe the issue or service needed…"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
              if (errors.description) setErrors((p) => ({ ...p, description: '' }))
            }}
          />
          {errors.description && <p className="text-sm text-red-500">{errors.description}</p>}
        </div>

        {/* ── Service Address ── */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Service Address <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            className={`w-full h-[46px] bg-white dark:bg-gray-800 border-2 rounded-lg px-3.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none transition-all ${
              errors.address ? 'border-red-500' : 'border-gray-200 dark:border-gray-700 focus:border-emerald-500'
            }`}
            placeholder="Full address where service is needed"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value)
              if (errors.address) setErrors((p) => ({ ...p, address: '' }))
            }}
          />
          {errors.address && <p className="text-sm text-red-500">{errors.address}</p>}
        </div>

        {/* ── Optional fields row ── */}
        <div className="flex flex-wrap gap-4">
          {/* Contact Phone */}
          <div className="flex-1 min-w-[200px] space-y-2">
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Contact Phone</label>
            <input
              type="tel"
              className="w-full h-[46px] bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-lg px-3.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none transition-all focus:border-emerald-500"
              placeholder="e.g. 09123456789"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </div>

          {/* Preferred Date */}
          <div className="flex-1 min-w-[200px] space-y-2">
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Preferred Date</label>
            <input
              type="date"
              className="w-full h-[46px] bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-lg px-3.5 text-sm text-gray-900 dark:text-white outline-none transition-all focus:border-emerald-500"
              value={preferredDate}
              onChange={(e) => setPreferredDate(e.target.value)}
            />
          </div>
        </div>

        {/* ── Submit error ── */}
        {submitError && (
          <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3.5">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300 font-medium">{submitError}</p>
          </div>
        )}

        {/* ── Actions ── */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-5 py-2.5 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 transition-all"
          >
            Cancel
          </button>

          <button
            type="submit"
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-70 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-all min-w-[140px] justify-center"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Submit Ticket</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  )
}
