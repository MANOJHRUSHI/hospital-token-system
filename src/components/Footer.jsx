import hmLogo from '../assets/hm-technologies-logo.png'

export default function Footer() {
  return (
    <footer className="w-full border-t border-slate-200/70 bg-white/60 py-4 backdrop-blur-xs">
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 text-center">
        <span className="text-xs font-medium text-slate-500">
          Developed and Designed by
        </span>
        <div className="inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 transition-colors hover:bg-slate-100/80">
          <img
            src={hmLogo}
            alt="HM Technologies Logo"
            className="h-4.5 w-4.5 rounded-sm object-cover shadow-2xs"
            loading="lazy"
          />
          <span className="text-xs font-semibold tracking-tight text-slate-800">
            HM Technologies
          </span>
        </div>
      </div>
    </footer>
  )
}
