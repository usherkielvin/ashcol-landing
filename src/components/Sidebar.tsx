import React, { useState } from "react";
import {
  MdOutlineDashboard,
  MdOutlineConfirmationNumber,
  MdOutlinePeopleAlt,
  MdOutlineInsertChartOutlined,
  MdMenuBook,
  MdOutlineBusiness,
  // Tickets sub-icons
  MdOutlineLocalActivity,
  MdOutlineCalendarMonth,
  MdOutlineArchive,
  // Operations sub-icons
  MdOutlineDescription,
  MdOutlinePlaylistAdd,
  MdOutlineChecklist,
  MdOutlineAltRoute,
  // Finance sub-icons
  MdOutlineReceipt,
  MdOutlineMonetizationOn,
  MdOutlineBarChart,
  MdOutlineAccountBalanceWallet,
  MdOutlinePhone,
  // Directory sub-icons
  MdOutlinePerson,
  MdOutlineStorefront,
} from "react-icons/md";
import { FiChevronDown, FiMinus, FiPlus } from "react-icons/fi";

// ── Types ──────────────────────────────────────────────────────────────────
interface SubItem {
  name: string;
  icon: React.ReactNode;
}

interface NavItem {
  title: string;
  icon: React.ReactNode;
  subItems: SubItem[];
}

// ── Component ──────────────────────────────────────────────────────────────
const Sidebar = () => {
  const [openMenu, setOpenMenu] = useState<string | null>("Tickets");

  const toggleMenu = (menu: string) => {
    setOpenMenu(openMenu === menu ? null : menu);
  };

  const navItems: NavItem[] = [
    {
      title: "Tickets",
      icon: <MdOutlineConfirmationNumber size={20} />,
      subItems: [
        { name: "Queue",     icon: <MdOutlineLocalActivity size={15} /> },
        { name: "Schedules", icon: <MdOutlineCalendarMonth size={15} /> },
        { name: "Archives",  icon: <MdOutlineArchive size={15} /> },
      ],
    },
    {
      title: "Operations",
      icon: <MdOutlinePeopleAlt size={20} />,
      subItems: [
        { name: "LINEUP",       icon: <MdOutlinePlaylistAdd size={15} /> },
        { name: "HRIS",         icon: <MdOutlineDescription size={15} /> },
        { name: "DDRM",         icon: <MdOutlineAltRoute size={15} /> },
        { name: "Request Forms", icon: <MdOutlineDescription size={15} /> },
        { name: "Office tasks", icon: <MdOutlineChecklist size={15} /> },
      ],
    },
    {
      title: "Finance",
      icon: <MdOutlineInsertChartOutlined size={20} />,
      subItems: [
        { name: "Expenses",     icon: <MdOutlineReceipt size={15} /> },
        { name: "Collections",  icon: <MdOutlineMonetizationOn size={15} /> },
        { name: "Branch quota", icon: <MdOutlineBarChart size={15} /> },
        { name: "Bills",        icon: <MdOutlineAccountBalanceWallet size={15} /> },
        { name: "Telecoms",     icon: <MdOutlinePhone size={15} /> },
      ],
    },
    {
      title: "Directory",
      icon: <MdMenuBook size={20} />,
      subItems: [
        { name: "Members",   icon: <MdOutlinePerson size={15} /> },
        { name: "Branches",  icon: <MdOutlineStorefront size={15} /> },
      ],
    },
  ];

  return (
    <div className="w-72 h-screen bg-gradient-to-b from-[#0a180f] via-[#205e30] to-[#3ca94d] flex flex-col text-white font-sans overflow-hidden">

      {/* ── Top Section: Logo & Header ─────────────────────────────── */}
      <div className="px-6 pt-8 pb-4">
        <div className="flex items-center space-x-3 mb-8">
          <div className="h-10 w-24 border border-green-500 rounded-full flex items-center justify-center text-xs text-green-400 font-bold italic">
            ASHCOL
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-wide">ASHCOL</h1>
            <p className="text-[10px] text-green-500 font-semibold uppercase tracking-wider">Portal</p>
          </div>
        </div>
        <p className="text-xs text-gray-400/80 font-semibold mb-4 tracking-wider">NAVIGATION</p>
      </div>

      {/* ── Main Navigation ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 custom-scrollbar">

        {/* Overview (Active State) — preserved unchanged */}
        <button className="w-full flex items-center space-x-3 bg-[#164a25] hover:bg-[#1c5c2e] text-white px-4 py-3 rounded-xl mb-2 transition-colors">
          <MdOutlineDashboard size={20} />
          <span className="font-semibold text-sm">Overview</span>
        </button>

        {/* ── Accordion Menus ──────────────────────────────────────── */}
        {navItems.map((item) => {
          const isOpen = openMenu === item.title;
          return (
            <div key={item.title} className="mb-1">

              {/* Parent Category Button */}
              <button
                onClick={() => toggleMenu(item.title)}
                className="w-full flex items-center justify-between px-4 py-3 text-gray-100 hover:bg-white/5 rounded-xl transition-colors"
              >
                <div className="flex items-center space-x-3">
                  {item.icon}
                  <span className="font-medium text-sm">{item.title}</span>
                </div>
                {isOpen ? <FiMinus size={16} /> : <FiPlus size={16} />}
              </button>

              {/* ── Sub-items with dotted connector line ─────────── */}
              {isOpen && (
                <div className="relative ml-6 mt-1 mb-2 pl-4">
                  {/* Vertical dotted border — preserved */}
                  <div className="absolute left-[3px] top-2 bottom-4 border-l-2 border-dotted border-white/30" />

                  <div className="flex flex-col space-y-3 py-2">
                    {item.subItems.map((sub, idx) => (
                      <div
                        key={idx}
                        className="relative flex items-center gap-1.5 text-sm text-gray-200 hover:text-white cursor-pointer transition-colors"
                      >
                        {/* Horizontal dash — anchored to left, touches the icon */}
                        <div className="absolute -left-4 w-2 border-t-2 border-dotted border-white/30" />

                        {/* Sub-item icon — sits flush at container left edge */}
                        <span className="shrink-0 opacity-80">{sub.icon}</span>

                        {/* Sub-item label */}
                        <span className="text-[13px] font-medium leading-none">{sub.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Bottom Sticky Section — preserved unchanged ────────────── */}
      <div className="px-4 pb-6 pt-4 space-y-2">
        {/* Location Dropdown */}
        <button className="w-full flex items-center justify-between bg-[#268038] hover:bg-[#2b913f] px-4 py-3 rounded-xl transition-colors shadow-sm">
          <div className="flex items-center space-x-3">
            <MdOutlineBusiness size={18} />
            <span className="font-bold text-sm">BULACAN</span>
          </div>
          <FiChevronDown size={18} className="text-white/70" />
        </button>

        {/* User Profile Dropdown */}
        <button className="w-full flex items-center justify-between bg-[#268038] hover:bg-[#2b913f] px-4 py-3 rounded-xl transition-colors shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-[#268038] font-bold text-sm">
              U
            </div>
            <div className="text-left">
              <h3 className="font-bold text-sm leading-tight">USHER</h3>
              <p className="text-[10px] text-white/70 font-medium">ADMIN</p>
            </div>
          </div>
          <FiChevronDown size={18} className="text-white/70" />
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
