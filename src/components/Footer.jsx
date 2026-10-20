import { useState } from 'react'
import { Modal, Btn } from './ui'
import hmLogo from '../assets/hm-technologies-logo.png'

// ---------------------------------------------------------------------------
// HM Technologies Website Configuration
// In the future, simply paste your live website URL here (e.g., 'https://hmtechnologies.in')
// ---------------------------------------------------------------------------
export const HM_TECHNOLOGIES_WEBSITE_URL = ''

export default function Footer() {
  const [isOpen, setIsOpen] = useState(false)

  const handleBrandClick = (e) => {
    e.preventDefault()
    // If a live website URL is provided, open it in a new tab;
    // otherwise, open the preview modal showing the logo and company profile.
    if (HM_TECHNOLOGIES_WEBSITE_URL && HM_TECHNOLOGIES_WEBSITE_URL.trim() !== '') {
      window.open(HM_TECHNOLOGIES_WEBSITE_URL, '_blank', 'noopener,noreferrer')
    } else {
      setIsOpen(true)
    }
  }

  return (
    <>
      <footer className="w-full border-t border-slate-200/70 bg-white/60 py-4 backdrop-blur-xs">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 text-center">
          <span className="text-xs font-medium text-slate-500">
            Developed and Designed by
          </span>
          <button
            type="button"
            onClick={handleBrandClick}
            title="Click to view HM Technologies profile & logo"
            className="group inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 transition-all hover:bg-slate-100/90 hover:ring-1 hover:ring-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <img
              src={hmLogo}
              alt="HM Technologies Logo"
              className="h-4.5 w-4.5 rounded-sm object-cover shadow-2xs transition-transform group-hover:scale-105"
              loading="lazy"
            />
            <span className="text-xs font-semibold tracking-tight text-slate-800 group-hover:text-teal-700">
              HM Technologies
            </span>
          </button>
        </div>
      </footer>

      {/* HM Technologies Interactive Brand & Logo Modal */}
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="HM Technologies"
        subtitle="Software Engineering & Digital Transformation"
        maxWidth="max-w-md"
      >
        <div className="flex flex-col items-center text-center space-y-4 py-2">
          {/* Logo Showcase Card */}
          <div className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-[#091524] p-4 shadow-lg ring-1 ring-slate-800/20">
            <img
              src={hmLogo}
              alt="HM Technologies Official Brand Logo"
              className="h-44 w-44 rounded-xl object-contain drop-shadow-md"
            />
          </div>

          <div className="space-y-1">
            <h4 className="text-base font-bold text-slate-900">
              HM Technologies
            </h4>
            <p className="text-xs text-slate-500 max-w-xs">
              Designing and developing modern, mission-critical digital healthcare, cloud, and enterprise solutions.
            </p>
          </div>

          {/* Website Link Section */}
          <div className="w-full pt-2">
            {HM_TECHNOLOGIES_WEBSITE_URL && HM_TECHNOLOGIES_WEBSITE_URL.trim() !== '' ? (
              <a
                href={HM_TECHNOLOGIES_WEBSITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-teal-700 transition focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <span>Visit Official Website</span>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-700">
                  <span className="inline-block h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
                  Official Website
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Coming soon. To connect your live domain, set <code className="rounded bg-slate-200 px-1 py-0.5 font-mono text-[10px] text-slate-800">HM_TECHNOLOGIES_WEBSITE_URL</code> in <code className="rounded bg-slate-200 px-1 py-0.5 font-mono text-[10px] text-slate-800">Footer.jsx</code>.
                </p>
              </div>
            )}
          </div>

          <div className="w-full pt-1">
            <Btn
              variant="secondary"
              onClick={() => setIsOpen(false)}
              className="w-full !py-2 text-xs"
            >
              Close
            </Btn>
          </div>
        </div>
      </Modal>
    </>
  )
}
