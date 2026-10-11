import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Stethoscope, Ruler, Zap, Wrench } from 'lucide-react'
import DiagnosticFlow from './DiagnosticFlow'
import RoomSizeCalculator from './RoomSizeCalculator'
import ElectricBillCalculator from './ElectricBillCalculator'

export type ToolTab = 'diagnostic' | 'calculator' | 'bill'

export const AirconToolsSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ToolTab>('diagnostic')

  const TABS = [
    {
      id: 'diagnostic' as ToolTab,
      label: 'AC Diagnostic',
      sublabel: 'Troubleshoot Problems',
      icon: Stethoscope
    },
    {
      id: 'calculator' as ToolTab,
      label: 'Room Calculator',
      sublabel: 'What HP do I need?',
      icon: Ruler
    },
    {
      id: 'bill' as ToolTab,
      label: 'Electric Bill',
      sublabel: 'Meralco Cost & Savings',
      icon: Zap
    }
  ]

  return (
    <section id="tools" className="relative w-full py-20 lg:py-28 bg-[#F8FAFC] overflow-hidden">
      {/* Decorative background grid and blurs */}
      <div className="absolute inset-0 opacity-40 pointer-events-none bg-[radial-gradient(#CBD5E1_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-emerald-100/40 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Heading */}
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-100/80 border border-emerald-300 text-emerald-800 text-xs font-bold uppercase tracking-widest mb-4 shadow-sm">
            <Wrench className="w-3.5 h-3.5" />
            Smart AC Engineering Tools
          </div>
          <h2 className="text-[#093600] font-['Big_Shoulders_Display',sans-serif] text-[36px] sm:text-[48px] lg:text-[56px] font-bold leading-none tracking-tight uppercase">
            Diagnose, Calculate & Save
          </h2>
          <p className="font-sans text-[15px] sm:text-[17px] font-medium leading-relaxed text-slate-600 mt-3 max-w-2xl mx-auto">
            Interactive HVAC diagnostics, precision room horsepower sizing, and Philippine Meralco bill forecasts — built with 12+ years of ASHCOL technical experience.
          </p>

          {/* Tab Switcher Pills */}
          <div className="mt-8 flex items-center justify-center">
            <div className="inline-flex p-1.5 rounded-2xl bg-white border border-slate-200/90 shadow-lg shadow-slate-900/5 max-w-full overflow-x-auto">
              {TABS.map(tab => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative flex items-center gap-2.5 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 whitespace-nowrap ${
                      isActive
                        ? 'text-white shadow-md'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeToolTab"
                        className="absolute inset-0 bg-[#0F172A] rounded-xl"
                        transition={{ type: 'spring', duration: 0.5, bounce: 0.15 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                      <span>{tab.label}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Tab Content with Animation */}
        <div className="w-full">
          <AnimatePresence mode="wait">
            {activeTab === 'diagnostic' && (
              <motion.div
                key="diagnostic"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
              >
                <DiagnosticFlow onSwitchTab={(tab) => setActiveTab(tab)} />
              </motion.div>
            )}

            {activeTab === 'calculator' && (
              <motion.div
                key="calculator"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
              >
                <RoomSizeCalculator onSwitchTab={(tab) => setActiveTab(tab)} />
              </motion.div>
            )}

            {activeTab === 'bill' && (
              <motion.div
                key="bill"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
              >
                <ElectricBillCalculator onSwitchTab={(tab) => setActiveTab(tab)} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}
export default AirconToolsSection
