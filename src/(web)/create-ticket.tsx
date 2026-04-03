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
  const [region, setRegion] = useState('')
  const [city, setCity] = useState('')
  const [barangay, setBarangay] = useState('')
  const [street, setStreet] = useState('')
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
    if (!region.trim()) next.region = 'Region is required.'
    if (!city.trim()) next.city = 'City is required.'
    if (!barangay.trim()) next.barangay = 'Barangay is required.'
    if (!street.trim()) next.street = 'Street is required.'
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

      // Format address: Region, City, Barangay, Street
      const fullLocation = [region.trim(), city.trim(), barangay.trim(), street.trim()]
        .filter(Boolean)
        .join(', ')

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
          location: fullLocation,
          contactPhone: contactPhone.trim() || undefined,
          preferredDate: preferredDate || undefined,
        })
      })
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to submit ticket')
      }

      const data = await res.json()
      if (!data.success) {
        throw new Error(data.message || 'Failed to submit ticket')
      }

      // Navigate to tickets page
      navigate('/tickets', { replace: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit ticket. Please try again.'
      setSubmitError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto pb-10 px-4 sm:px-6">
      <div className="max-w-[680px] mx-auto space-y-5 py-4">

        {/* ── Service Type ── */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Service Type <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
            {SERVICE_TYPES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setServiceType(s)
                  if (errors.serviceType) setErrors((p) => ({ ...p, serviceType: '' }))
                }}
                className={`px-4 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all ${
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
        <div className="space-y-3">
          <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Service Address <span className="text-red-500">*</span>
          </label>
          
          {/* Region */}
          <div>
            <input
              type="text"
              className={`w-full h-[46px] bg-white dark:bg-gray-800 border-2 rounded-lg px-3.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none transition-all ${
                errors.region ? 'border-red-500' : 'border-gray-200 dark:border-gray-700 focus:border-emerald-500'
              }`}
              placeholder="Region (e.g., NCR, Region III)"
              value={region}
              onChange={(e) => {
                setRegion(e.target.value)
                if (errors.region) setErrors((p) => ({ ...p, region: '' }))
              }}
            />
            {errors.region && <p className="text-xs text-red-500 mt-1">{errors.region}</p>}
          </div>

          {/* City */}
          <div>
            <input
              type="text"
              className={`w-full h-[46px] bg-white dark:bg-gray-800 border-2 rounded-lg px-3.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none transition-all ${
                errors.city ? 'border-red-500' : 'border-gray-200 dark:border-gray-700 focus:border-emerald-500'
              }`}
              placeholder="City/Municipality (e.g., Quezon City)"
              value={city}
              onChange={(e) => {
                setCity(e.target.value)
                if (errors.city) setErrors((p) => ({ ...p, city: '' }))
              }}
            />
            {errors.city && <p className="text-xs text-red-500 mt-1">{errors.city}</p>}
          </div>

          {/* Barangay */}
          <div>
            <input
              type="text"
              className={`w-full h-[46px] bg-white dark:bg-gray-800 border-2 rounded-lg px-3.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none transition-all ${
                errors.barangay ? 'border-red-500' : 'border-gray-200 dark:border-gray-700 focus:border-emerald-500'
              }`}
              placeholder="Barangay (e.g., Barangay 123)"
              value={barangay}
              onChange={(e) => {
                setBarangay(e.target.value)
                if (errors.barangay) setErrors((p) => ({ ...p, barangay: '' }))
              }}
            />
            {errors.barangay && <p className="text-xs text-red-500 mt-1">{errors.barangay}</p>}
          </div>

          {/* Street */}
          <div>
            <input
              type="text"
              className={`w-full h-[46px] bg-white dark:bg-gray-800 border-2 rounded-lg px-3.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none transition-all ${
                errors.street ? 'border-red-500' : 'border-gray-200 dark:border-gray-700 focus:border-emerald-500'
              }`}
              placeholder="Street/House No. (e.g., 123 Main St.)"
              value={street}
              onChange={(e) => {
                setStreet(e.target.value)
                if (errors.street) setErrors((p) => ({ ...p, street: '' }))
              }}
            />
            {errors.street && <p className="text-xs text-red-500 mt-1">{errors.street}</p>}
          </div>
        </div>

        {/* ── Optional fields ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Contact Phone */}
          <div className="space-y-2">
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
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Preferred Date</label>
            <input
              type="date"
              className="w-full h-[46px] bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-lg px-3.5 text-sm text-gray-900 dark:text-white outline-none transition-all focus:border-emerald-500"
              value={preferredDate}
              onChange={(e) => setPreferredDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
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
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-full sm:w-auto px-5 py-2.5 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 transition-all"
          >
            Cancel
          </button>

          <button
            type="submit"
            onClick={handleSubmit}
            disabled={loading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-70 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-all min-w-[140px]"
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
