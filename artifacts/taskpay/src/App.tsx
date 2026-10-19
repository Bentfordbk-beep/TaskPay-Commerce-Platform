import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ClerkProvider, Show, SignIn, SignUp, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  useAddCartItem, useApplyAsVendor, useApplyToCampaign, useArchiveProduct, useBeginCheckout,
  useCreateAffiliateLink, useCreateSupportRequest, useEnrolInCourse, useGetAdminSettings,
  useGetAdminSummary, useGetAffiliateOverview, useGetCart, useGetDashboard, useGetHomeSnapshot,
  useGetMe, useGetMyVendor, useGetProduct, useGetWallet, useListAdminRecords,
  useListAffiliateLinks, useListCategories, useListCampaigns, useListCourses, useListEvents,
  useListMyCampaignSubmissions, useListMyEnrolments, useListMyOrders, useListMyProducts,
  useListMyTickets, useListProducts, usePurchaseTicket, useRemoveCartItem, useRequestPayout,
  useReviewAdminRecord, useUpdateAdminSettings, useUpdateMe, useUpdateProduct,
  getGetAdminSettingsQueryKey, getGetAdminSummaryQueryKey, getGetAffiliateOverviewQueryKey,
  getGetCartQueryKey, getGetMeQueryKey, getGetMyVendorQueryKey, getGetWalletQueryKey, getListAdminRecordsQueryKey,
  getListAffiliateLinksQueryKey, getListMyCampaignSubmissionsQueryKey,
  getListMyEnrolmentsQueryKey, getListMyOrdersQueryKey, getListMyProductsQueryKey,
  getListMyTicketsQueryKey,
  useCreateProduct,
} from '@workspace/api-client-react';
import {
  ArrowRight, BookOpen, BriefcaseBusiness, CalendarDays, CircleHelp, ClipboardList, Compass,
  GraduationCap, Headphones, Home, Menu, Package, Search, ShieldCheck, ShoppingBag, ShoppingCart,
  Store, Ticket, Wallet, Zap,
} from 'lucide-react';
import {
  Link, Redirect, Route, Switch, Router as WouterRouter, useLocation, useParams,
} from 'wouter';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
function stripBase(path: string) { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: {
    colorPrimary: '#f2b92f', colorForeground: '#172846', colorMutedForeground: '#68758a',
    colorDanger: '#b94b40', colorBackground: '#fffefa', colorInput: '#ffffff',
    colorInputForeground: '#172846', colorNeutral: '#dfe2e7', fontFamily: 'DM Sans',
    borderRadius: '0.7rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fffefa] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#e8e7e1]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#172846] font-bold', headerSubtitle: 'text-[#68758a]',
    socialButtonsBlockButtonText: 'text-[#172846] font-semibold', formFieldLabel: 'text-[#394860] font-semibold',
    footerActionLink: 'text-[#172846] font-semibold', footerActionText: 'text-[#68758a]',
    dividerText: 'text-[#68758a]', identityPreviewEditButton: 'text-[#172846]',
    formFieldSuccessText: 'text-[#267063]', alertText: 'text-[#172846]',
    logoBox: 'mb-4', logoImage: 'max-h-10', socialButtonsBlockButton: 'border-[#dfe2e7] rounded-xl',
    formButtonPrimary: 'rounded-xl font-bold text-[#172846] shadow-none',
    formFieldInput: 'rounded-xl border-[#dfe2e7] text-[#172846]', footerAction: 'text-[#68758a]',
    dividerLine: 'bg-[#e6e8eb]', alert: 'rounded-xl', otpCodeFieldInput: 'rounded-lg',
    formFieldRow: 'gap-2', main: 'gap-4',
  },
};

const money = (minor?: number | null, currency = 'GHS') =>
  new Intl.NumberFormat('en-GH', { style: 'currency', currency, maximumFractionDigits: 2 }).format((minor || 0) / 100);
const dateLabel = (date?: string) => date ? new Date(date).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date to be announced';

function Logo() {
  return <Link href="/" className="tp-logo" data-testid="link-taskpay-home"><span className="tp-mark">T</span><span>Task<span style={{ color: '#d89f18' }}>Pay</span><small style={{ display: 'block', fontFamily: 'var(--app-font-sans)', fontSize: 9, letterSpacing: '2px', fontWeight: 700, marginTop: -4 }}>SELL. LEARN. EARN.</small></span></Link>;
}
function StateBlock({ title, body, retry, kind = 'empty' }: { title: string; body: string; retry?: () => void; kind?: string }) {
  return <div className="tp-card" style={{ padding: 28, textAlign: 'center' }} data-testid={`state-${kind}`}>
    <div style={{ width: 44, height: 44, margin: '0 auto 12px', display: 'grid', placeItems: 'center', borderRadius: 14, background: '#eff3f4', color: '#1c4666' }}><CircleHelp size={21} /></div>
    <h3 style={{ fontSize: 18, margin: '0 0 6px' }} data-testid="text-state-title">{title}</h3><p className="tp-muted" style={{ margin: '0 auto', maxWidth: 440, fontSize: 14 }} data-testid="text-state-description">{body}</p>
    {retry && <button className="tp-btn tp-btn-outline" style={{ marginTop: 17 }} onClick={retry} data-testid="button-retry">Try again</button>}
  </div>;
}
function QueryState({ query, children, empty }: { query: any; children: ReactNode; empty?: boolean }) {
  if (query.isLoading) return <div style={{ display: 'grid', gap: 12 }} aria-label="Loading"><div className="tp-skeleton" style={{ height: 120 }} /><div className="tp-skeleton" style={{ height: 180 }} /></div>;
  if (query.isError) return <StateBlock title="We couldn’t load this just now" body="Check your connection, then try again. Your account and payment information stay protected." retry={() => query.refetch()} kind="error" />;
  if (empty) return <StateBlock title="Nothing here yet" body="When there’s something to show, you’ll find it here. Explore TaskPay to get started." />;
  return <>{children}</>;
}
function Notice({ text, tone = 'info' }: { text: string; tone?: string }) {
  return <div role="status" data-testid={`notice-${tone}`} style={{ padding: '12px 14px', borderRadius: 12, background: tone === 'error' ? '#fff0ed' : '#edf5f4', color: tone === 'error' ? '#a34238' : '#285c55', fontSize: 13 }}>{text}</div>;
}
function Status({ value }: { value?: string }) { return <span className={`tp-status ${value || ''}`} data-testid={`status-${value || 'unknown'}`}>{(value || 'unknown').replaceAll('_', ' ')}</span>; }

const topLinks = [
  ['/shop', 'Shop'], ['/digital', 'Digital'], ['/affiliate', 'Affiliate'], ['/campaigns', 'Campaigns'], ['/learn', 'Learn'], ['/events', 'Events'], ['/vendor', 'Sell'],
];
function Header() {
  const [menu, setMenu] = useState(false);
  const [location] = useLocation();
  const { signOut } = useClerk();
  return <header className="tp-header" style={{ position: 'sticky', top: 0, zIndex: 25 }}>
    <div className="tp-container" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
      <Logo />
      <nav className="tp-desktop-links" style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        {topLinks.map(([href, label]) => <Link key={href} href={href} style={{ fontSize: 13, fontWeight: 650, textDecoration: 'none', color: location === href ? '#152746' : '#68758a' }} data-testid={`link-nav-${label.toLowerCase()}`}>{label}</Link>)}
      </nav>
      <div className="tp-desktop-links" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <Show when="signed-out"><Link href="/sign-in" className="tp-btn tp-btn-outline" style={{ padding: '10px 13px', fontSize: 13 }} data-testid="link-sign-in">Log in</Link><Link href="/sign-up" className="tp-btn" style={{ padding: '10px 15px', fontSize: 13 }} data-testid="link-sign-up">Get started</Link></Show>
        <Show when="signed-in"><Link href="/dashboard" className="tp-btn" style={{ padding: '10px 15px', fontSize: 13 }} data-testid="link-account">My TaskPay <ArrowRight size={15} /></Link><button type="button" className="tp-btn tp-btn-outline" style={{ padding: '10px 12px', fontSize: 12 }} onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out">Sign out</button></Show>
      </div>
      <button type="button" onClick={() => setMenu(!menu)} className="mobile-menu-button" aria-label={menu ? 'Close menu' : 'Open menu'} data-testid="button-mobile-menu" style={{ border: 0, background: 'transparent', color: '#172744', display: 'none' }}><Menu /></button>
    </div>
    {menu && <div className="mobile-menu" style={{ position: 'absolute', top: 64, left: 0, right: 0, background: '#fffefa', borderBottom: '1px solid #e6e5df', padding: '12px 20px 20px', display: 'grid', gap: 5 }}>
      {topLinks.map(([href, label]) => <Link key={href} href={href} onClick={() => setMenu(false)} style={{ padding: 12, textDecoration: 'none', color: '#172744', fontWeight: 650 }} data-testid={`link-mobile-${label.toLowerCase()}`}>{label}</Link>)}
      <Link href="/vendor" onClick={() => setMenu(false)} style={{ padding: 12, color: '#172744', fontWeight: 650, textDecoration: 'none' }}>Become a vendor</Link>
      <Show when="signed-out"><div style={{ display: 'flex', gap: 9, padding: '8px 10px' }}><Link href="/sign-in" className="tp-btn tp-btn-outline" onClick={() => setMenu(false)}>Log in</Link><Link href="/sign-up" className="tp-btn" onClick={() => setMenu(false)}>Get started</Link></div></Show>
      <Show when="signed-in"><Link href="/dashboard" onClick={() => setMenu(false)} className="tp-btn" style={{ margin: 9 }}>My TaskPay</Link></Show>
    </div>}
    <style>{'@media(max-width:760px){.mobile-menu-button{display:block!important}.mobile-menu{display:grid!important}}'}</style>
  </header>;
}
function BottomNav() {
  const [location] = useLocation();
  const links = [['/', 'Home', Home], ['/shop', 'Explore', Compass], ['/affiliate', 'Earn', Zap], ['/account/profile', 'Account', Wallet], ['/dashboard', 'Overview', ClipboardList]] as const;
  return <nav className="tp-bottom-nav" aria-label="Mobile navigation">{links.map(([href, label, Icon]) => <Link key={href} href={href} className={location === href ? 'active' : ''} data-testid={`mobile-nav-${label.toLowerCase()}`}><Icon /><span>{label}</span></Link>)}</nav>;
}
function Footer() {
  return <footer style={{ background: '#162744', color: '#fff', marginTop: 74, padding: '44px 0 32px' }}><div className="tp-container">
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 28, flexWrap: 'wrap' }}><div><Logo /><p style={{ color: '#c1cada', maxWidth: 315, fontSize: 14, lineHeight: 1.7 }}>A trusted everyday hub for commerce, learning and real transaction-based opportunities.</p></div>
      <div style={{ display: 'flex', gap: 34, flexWrap: 'wrap' }}>{[['Explore', ['/shop', 'Shop'], ['/digital', 'Digital products'], ['/learn', 'Learning']], ['Participate', ['/vendor', 'Become a vendor'], ['/affiliate', 'Affiliate programme'], ['/campaigns', 'Campaigns'], ['/events', 'Events']]].map((group) => <div key={group[0]}><div style={{ fontWeight: 750, marginBottom: 12 }}>{group[0]}</div>{group.slice(1).map(([href, text]) => <Link key={href} href={href} style={{ display: 'block', color: '#c1cada', marginBottom: 9, fontSize: 13, textDecoration: 'none' }}>{text}</Link>)}</div>)}</div>
    </div><div style={{ borderTop: '1px solid #344460', marginTop: 32, paddingTop: 18, fontSize: 12, color: '#aeb9c9', display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}><span>© {new Date().getFullYear()} TaskPay · Sell. Learn. Earn.</span><span>Opportunities depend on real sales, eligible work and platform review. No earnings are guaranteed.</span></div>
  </div></footer>;
}
function AppFrame({ children }: { children: ReactNode }) {
  return <div className="tp-shell"><Header /><main className="tp-main">{children}</main><Footer /><BottomNav /></div>;
}
function SectionTitle({ eyebrow, title, body, action }: { eyebrow?: string; title: string; body?: string; action?: ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 18, marginBottom: 22, flexWrap: 'wrap' }}><div>{eyebrow && <div className="tp-eyebrow" style={{ marginBottom: 8 }}>{eyebrow}</div>}<h2 style={{ fontSize: 'clamp(24px,3vw,34px)', margin: 0 }}>{title}</h2>{body && <p className="tp-muted" style={{ maxWidth: 600, fontSize: 14, lineHeight: 1.7, margin: '8px 0 0' }}>{body}</p>}</div>{action}</div>;
}

function ProductTile({ product, digital = false }: { product: any; digital?: boolean }) {
  return <Link href={`/products/${product.id}`} className="tp-card" data-testid={`card-product-${product.id}`} style={{ padding: 12, textDecoration: 'none', color: '#172744', display: 'block' }}>
    <div className="tp-product-image">{product.imageUrl ? <img src={product.imageUrl} alt={product.title} /> : <div style={{ textAlign: 'center' }}><Package size={30} /><div style={{ fontSize: 11, marginTop: 6 }}>{digital ? 'Digital item' : 'Local find'}</div></div>}</div>
    <div style={{ padding: '13px 4px 4px' }}><div className="tp-muted" style={{ fontSize: 11, marginBottom: 5 }}>{product.categoryName || (digital ? 'Digital product' : 'Marketplace')}</div><div style={{ fontWeight: 750, minHeight: 40, lineHeight: 1.4 }}>{product.title}</div><div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 9 }}><strong>{money(product.salePriceMinor ?? product.priceMinor, product.currency)}</strong>{product.salePriceMinor && <del className="tp-muted" style={{ fontSize: 12 }}>{money(product.priceMinor, product.currency)}</del>}</div></div>
  </Link>;
}
function CourseTile({ course, enrolled = false, onEnroll }: { course: any; enrolled?: boolean; onEnroll?: () => void }) {
  return <article className="tp-card" style={{ padding: 13 }} data-testid={`card-course-${course.id}`}><div className="tp-product-image" style={{ height: 150 }}>{course.imageUrl ? <img src={course.imageUrl} alt={course.title} /> : <GraduationCap size={34} />}</div><div style={{ padding: '13px 3px 2px' }}><div className="tp-muted" style={{ fontSize: 12 }}>{course.creatorName} · {course.lessonCount} lessons</div><h3 style={{ margin: '7px 0', fontSize: 17 }}>{course.title}</h3><p className="tp-muted" style={{ fontSize: 13, lineHeight: 1.55, height: 40, overflow: 'hidden' }}>{course.description}</p><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}><strong>{money(course.priceMinor, course.currency)}</strong>{onEnroll && <button type="button" className="tp-btn" onClick={onEnroll} data-testid={`button-enrol-${course.id}`}>{enrolled ? 'Enrolled' : 'View course'}</button>}</div></div></article>;
}
function EventTile({ event, onBuy }: { event: any; onBuy?: () => void }) {
  return <article className="tp-card" style={{ padding: 13 }} data-testid={`card-event-${event.id}`}><div className="tp-product-image" style={{ height: 160, background: 'linear-gradient(135deg,#e5eef2,#efe8f5)' }}>{event.imageUrl ? <img src={event.imageUrl} alt={event.title} /> : <CalendarDays size={34} />}</div><div style={{ padding: '13px 3px 2px' }}><div className="tp-muted" style={{ fontSize: 12 }}>{dateLabel(event.startsAt)} · {event.city}, {event.country}</div><h3 style={{ margin: '7px 0', fontSize: 17 }}>{event.title}</h3><p className="tp-muted" style={{ fontSize: 13, height: 36, overflow: 'hidden' }}>{event.venue}</p><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}><strong>From {money(event.lowestPriceMinor, event.currency)}</strong>{onBuy && <button onClick={onBuy} type="button" className="tp-btn" data-testid={`button-ticket-${event.id}`}>Tickets</button>}</div></div></article>;
}

function HomePage() {
  const home = useGetHomeSnapshot();
  const [message, setMessage] = useState('');
  const data = home.data;
  const colorTiles = ['#fbf0d1', '#e6edf9', '#e8f4f1', '#f4e9f7'];
  return <div className="tp-container tp-enter" style={{ paddingTop: 28 }}>
    <div className="tp-hero" style={{ minHeight: 410, padding: 'clamp(32px,6vw,76px)', display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: 32, alignItems: 'center' }}>
      <div style={{ position: 'relative', zIndex: 2 }}><div className="tp-eyebrow" style={{ color: '#f2c351' }}>A better way to do business online</div><h1 style={{ fontSize: 'clamp(38px,5.7vw,66px)', maxWidth: 650, lineHeight: 1.05, margin: '16px 0' }}>Your Business. Your Opportunities. One Platform.</h1><p style={{ color: '#d7dfeb', maxWidth: 560, fontSize: 16, lineHeight: 1.75 }}>Discover products, grow your business, promote brands, develop digital skills and explore opportunities in digital commerce.</p><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 24 }}><Show when="signed-out"><Link href="/sign-up" className="tp-btn" data-testid="button-get-started">Get started <ArrowRight size={17} /></Link></Show><Show when="signed-in"><Link href="/dashboard" className="tp-btn" data-testid="button-go-dashboard">Go to your dashboard <ArrowRight size={17} /></Link></Show><Link href="/shop" className="tp-btn" style={{ background: 'transparent', border: '1px solid #8292a9', color: '#fff' }} data-testid="button-explore-products">Explore products</Link></div><div style={{ color: '#c5d0df', fontSize: 12, marginTop: 21 }}>Browse for free. Earn only through eligible, completed activity.</div></div>
      <div className="hero-visual" style={{ minHeight: 270, position: 'relative', display: 'grid', placeItems: 'center' }}><div style={{ width: 255, height: 255, borderRadius: '50%', background: 'radial-gradient(circle at 30% 26%,#f5c34d 0 12%,#e4a92a 13% 30%,#25466c 31% 68%,#1a3559 69%)', display: 'grid', placeItems: 'center', boxShadow: '0 30px 70px rgba(0,0,0,.23)', border: '1px solid rgba(255,255,255,.2)' }}><div style={{ width: 160, height: 160, background: '#fffefa', borderRadius: 28, display: 'grid', placeItems: 'center', transform: 'rotate(-8deg)', boxShadow: '0 14px 35px rgba(0,0,0,.15)' }}><span style={{ color: '#172d50', fontFamily: 'var(--app-font-serif)', fontWeight: 800, fontSize: 82 }}>T<span style={{ color: '#e5aa21' }}>.</span></span></div></div><div className="hero-float" style={{ position: 'absolute', top: 20, left: 4, background: '#fffefa', color: '#172744', borderRadius: 13, padding: '11px 14px', fontWeight: 750, boxShadow: '0 12px 30px #09182d44' }}><ShoppingBag size={17} style={{ verticalAlign: 'middle', marginRight: 7 }} /> Local commerce</div><div style={{ position: 'absolute', bottom: 15, right: 0, background: '#fffefa', color: '#172744', borderRadius: 13, padding: '11px 14px', fontWeight: 750, boxShadow: '0 12px 30px #09182d44' }}><GraduationCap size={17} style={{ verticalAlign: 'middle', marginRight: 7 }} /> Skills that travel</div></div>
    </div>
    {message && <div style={{ marginTop: 16 }}><Notice text={message} /></div>}
    {data?.paymentStatus === 'unconfigured' && <div style={{ marginTop: 18 }}><Notice text="Checkout is not configured yet. You can explore the marketplace, but payment cannot be completed until the platform enables a payment provider." /></div>}
    <section style={{ paddingTop: 66 }}><SectionTitle eyebrow="Find your next thing" title="Five ways to move forward" body="Shop, build a store, learn a skill or take part in a real campaign. Pick the path that fits you." />
      <div className="service-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>{[
        [ShoppingBag, 'Shop products', 'Discover physical goods from marketplace vendors.', '/shop', '#f5c246'],
        [Zap, 'Affiliate marketing', 'Share eligible products with a tracked link.', '/affiliate', '#ded8f8'],
        [BriefcaseBusiness, 'Campaigns', 'Apply to real brand briefs and submit work.', '/campaigns', '#d7eaf4'],
        [BookOpen, 'Digital learning', 'Build practical skills through courses.', '/learn', '#d9eee8'],
        [Ticket, 'Events', 'Find workshops, community events and more.', '/events', '#f9dfdc'],
      ].map(([Icon, title, body, href, bg]: any, i) => <Link key={title} href={href} className="tp-category tp-card" style={{ background: bg, border: 0, textDecoration: 'none', animationDelay: `${i * 70}ms` }} data-testid={`card-service-${i}`}><Icon size={23} /><span><strong style={{ display: 'block', marginBottom: 5 }}>{title}</strong><span style={{ fontSize: 12, lineHeight: 1.45, opacity: .75 }}>{body}</span></span></Link>)}</div>
    </section>
    <HomeCatalog data={data} query={home} />
    <section style={{ padding: '68px 0 0' }}><SectionTitle eyebrow="Getting started" title="Built around real participation" body="TaskPay brings everyday commerce and useful opportunities into one trusted place." />
      <div className="steps-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 15 }}>{[['01', 'Choose your path', 'Browse products, courses and event tickets. Or apply as a seller, promoter or organiser.'], ['02', 'Take a real action', 'Buy what you need, share a product you believe in or complete approved campaign work.'], ['03', 'Track the outcome', 'See order, enrolment, application and payment statuses in your account.']].map(([n,t,b]) => <div className="tp-card" key={n} style={{ padding: 23 }}><div className="tp-eyebrow">{n} / taskpay in practice</div><h3 style={{ margin: '13px 0 7px', fontSize: 20 }}>{t}</h3><p className="tp-muted" style={{ margin: 0, lineHeight: 1.65, fontSize: 14 }}>{b}</p></div>)}</div>
    </section>
    <section className="vendor-callout" style={{ marginTop: 66, padding: '34px 38px', borderRadius: 22, background: '#e9edf2', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}><div style={{ maxWidth: 650 }}><div className="tp-eyebrow">For Ghanaian businesses</div><h2 style={{ margin: '8px 0', fontSize: 29 }}>Put your business in front of customers.</h2><p className="tp-muted" style={{ margin: 0, lineHeight: 1.65 }}>Apply for a vendor profile and manage physical or digital listings in one place. Listing access is subject to review.</p></div><Link href="/vendor" className="tp-btn tp-btn-dark" data-testid="button-become-vendor">Become a vendor <ArrowRight size={16} /></Link></section>
    <section style={{ paddingTop: 68 }}><SectionTitle eyebrow="Good to know" title="Clear terms. No big promises." /><div className="faq-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>{[['Is browsing free?', 'Yes. Customers can browse TaskPay without an access fee. Product, course and ticket prices are shown before checkout.'], ['Is affiliate income guaranteed?', 'No. Affiliate commissions depend on eligible products, qualifying verified sales and applicable review.'], ['Are payments available now?', data?.paymentStatus === 'unconfigured' ? 'Payment processing is not configured on this platform yet. Checkout cannot report a successful payment until a provider is configured and payment is verified.' : 'Payment state is shown clearly during checkout and in your order history.'], ['Can I sell digital items?', 'Yes. Digital listings are separate from physical goods and use a distinct category catalogue. Access remains subject to purchase verification and the platform’s delivery setup.']].map(([q,a]) => <details className="tp-card" key={q} style={{ padding: 18 }}><summary style={{ fontWeight: 750, cursor: 'pointer' }}>{q}</summary><p className="tp-muted" style={{ marginBottom: 0, fontSize: 14, lineHeight: 1.65 }}>{a}</p></details>)}</div></section>
    <style>{'@media(max-width:760px){.service-grid{grid-template-columns:repeat(2,1fr)!important}.steps-grid,.faq-grid{grid-template-columns:1fr!important}.tp-hero{grid-template-columns:1fr!important}.hero-visual{min-height:210px!important}.hero-visual>div:first-child{width:185px!important;height:185px!important}.hero-visual>div:first-child>div{width:120px!important;height:120px!important}.vendor-callout{padding:25px!important}}'}</style>
  </div>;
}
function HomeCatalog({ data, query }: { data: any; query: any }) {
  return <div style={{ paddingTop: 66 }}>
    <section><SectionTitle eyebrow="Curated marketplace" title="Physical finds" body="Real products from TaskPay vendors. Category is kept distinct from digital products." action={<Link href="/shop" className="tp-btn tp-btn-outline">Browse physical <ArrowRight size={15} /></Link>} />
      <QueryState query={query} empty={!data?.featuredPhysical?.length}>{data?.featuredPhysical?.length ? <div className="product-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>{data.featuredPhysical.slice(0, 4).map((p: any) => <ProductTile key={p.id} product={p} />)}</div> : null}</QueryState>
    </section>
    <section style={{ paddingTop: 52 }}><SectionTitle eyebrow="Tools for your next idea" title="Digital products" body="Explore digital goods in a separate catalogue with its own categories." action={<Link href="/digital" className="tp-btn tp-btn-outline">Browse digital <ArrowRight size={15} /></Link>} />
      {data?.featuredDigital?.length ? <div className="product-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>{data.featuredDigital.slice(0, 4).map((p: any) => <ProductTile key={p.id} product={p} digital />)}</div> : <StateBlock title="Digital catalogue is ready to explore" body="No featured digital products are available right now. Browse the digital catalogue for current listings." />}
    </section>
    {data?.courses?.length > 0 && <section style={{ paddingTop: 52 }}><SectionTitle title="Learn something useful" action={<Link href="/learn" className="tp-btn tp-btn-outline">All courses <ArrowRight size={15} /></Link>} /><div className="product-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>{data.courses.slice(0, 3).map((c: any) => <CourseTile key={c.id} course={c} />)}</div></section>}
    {data?.events?.length > 0 && <section style={{ paddingTop: 52 }}><SectionTitle title="Coming together" action={<Link href="/events" className="tp-btn tp-btn-outline">All events <ArrowRight size={15} /></Link>} /><div className="product-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>{data.events.slice(0, 3).map((e: any) => <EventTile key={e.id} event={e} />)}</div></section>}
    <style>{'@media(max-width:760px){.product-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}'}</style>
  </div>;
}

function Catalogue({ type }: { type: 'physical' | 'digital' }) {
  const [search, setSearch] = useState('');
  const [categoryId, setCategory] = useState('');
  const [sort, setSort] = useState<'newest' | 'price-low' | 'price-high'>('newest');
  const products = useListProducts({ type, ...(categoryId ? { categoryId } : {}), ...(search ? { search } : {}), sort, page: 1, pageSize: 24 });
  const categories = useListCategories({ type });
  const items = products.data?.items || [];
  const isDigital = type === 'digital';
  return <div className="tp-container tp-enter" style={{ paddingTop: 42 }}>
    <div className="tp-eyebrow">{isDigital ? 'Separate digital catalogue' : 'Physical marketplace'}</div><h1 style={{ fontSize: 42, margin: '8px 0' }}>{isDigital ? 'Digital products' : 'Shop products'}</h1><p className="tp-muted" style={{ maxWidth: 620, lineHeight: 1.7 }}>{isDigital ? 'Browse e-books, templates, tools and other digital goods. Physical shipping fields do not apply.' : 'Find goods from local vendors, from everyday essentials to special finds.'}</p>
    <div className="catalog-filters" style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) 220px 180px', gap: 10, margin: '24px 0' }}>
      <label className="tp-label"><span>Search {isDigital ? 'digital goods' : 'products'}</span><span style={{ position: 'relative' }}><Search size={17} style={{ position: 'absolute', top: 14, left: 12, color: '#718096' }} /><input className="tp-input" style={{ paddingLeft: 38 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Try a title or keyword" data-testid="input-product-search" /></span></label>
      <label className="tp-label"><span>Category</span><select className="tp-input" value={categoryId} onChange={e => setCategory(e.target.value)} data-testid="select-product-category"><option value="">All {isDigital ? 'digital' : 'physical'} categories</option>{(categories.data || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="tp-label"><span>Sort by</span><select className="tp-input" value={sort} onChange={e => setSort(e.target.value as any)} data-testid="select-product-sort"><option value="newest">Newest</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label>
    </div>
    <QueryState query={products} empty={!items.length}>{items.length ? <><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, fontSize: 13 }}><span className="tp-muted">{products.data?.total ?? items.length} listings</span><span className="tp-muted">{isDigital ? 'Digital listings only' : 'Physical listings only'}</span></div><div className="product-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>{items.map((p: any) => <ProductTile key={p.id} product={p} digital={isDigital} />)}</div></> : null}</QueryState>
    <style>{'@media(max-width:760px){.catalog-filters{grid-template-columns:1fr!important}.product-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}'}</style>
  </div>;
}
function ProductDetail() {
  const { productId = '' } = useParams();
  const product = useGetProduct(productId);
  const add = useAddCartItem();
  const client = useQueryClient();
  const [notice, setNotice] = useState('');
  const p = product.data;
  const addItem = () => add.mutate({ data: { productId, quantity: 1 } }, { onSuccess: () => { client.invalidateQueries({ queryKey: getGetCartQueryKey() }); setNotice('Added to your cart. Checkout will show payment availability before an order is completed.'); }, onError: () => setNotice('We could not add this item. Please try again.') });
  return <div className="tp-container" style={{ padding: '40px 0' }}><QueryState query={product}>{p ? <><div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 38 }}><div className="tp-product-image" style={{ height: 450 }}>{p.imageUrl ? <img src={p.imageUrl} alt={p.title} /> : <Package size={48} />}</div><div style={{ paddingTop: 14 }}><div className="tp-eyebrow">{p.type === 'digital' ? 'Digital product' : p.categoryName}</div><h1 style={{ fontSize: 39, margin: '12px 0' }}>{p.title}</h1><div style={{ fontSize: 23, fontWeight: 800 }}>{money(p.salePriceMinor ?? p.priceMinor, p.currency)}</div><p style={{ fontSize: 14, lineHeight: 1.75, color: '#65738a', margin: '20px 0' }}>{p.description}</p><div className="tp-card" style={{ padding: 17, marginBottom: 16 }}><div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><Store size={20} color="#33776c" /><div><div className="tp-muted" style={{ fontSize: 11 }}>Provided by</div><strong>{p.vendorName}</strong></div></div><div style={{ borderTop: '1px solid #ecebe6', marginTop: 15, paddingTop: 13, display: 'grid', gap: 9, fontSize: 13 }}><div><strong>Availability</strong> · {p.stockQuantity === null ? 'Contact vendor for availability' : p.stockQuantity > 0 ? `${p.stockQuantity} available` : 'Currently unavailable'}</div>{p.type === 'physical' && <div><strong>Delivery</strong> · {p.deliverySummary || 'Delivery details are provided by the vendor.'}</div>}{p.type === 'physical' && p.condition && <div><strong>Condition</strong> · {p.condition}</div>}{p.type === 'digital' && <div><strong>Digital access</strong> · Protected access details are shared after verified purchase.</div>}</div></div><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><Show when="signed-in"><button type="button" className="tp-btn" onClick={addItem} disabled={add.isPending || p.stockQuantity === 0} data-testid="button-add-to-cart"><ShoppingCart size={17} />{add.isPending ? 'Adding…' : 'Add to cart'}</button></Show><Show when="signed-out"><Link href="/sign-in" className="tp-btn">Sign in to add to cart</Link></Show><Link href={p.type === 'digital' ? '/digital' : '/shop'} className="tp-btn tp-btn-outline">Back to catalogue</Link></div>{notice && <div style={{ marginTop: 15 }}><Notice text={notice} tone={notice.startsWith('We could') ? 'error' : 'info'} /></div>}{p.affiliateEligible && <div style={{ marginTop: 20, padding: 15, background: '#f0edf8', borderRadius: 13, fontSize: 13 }}>This listing is eligible for affiliate promotion. Commission is dependent on qualifying, verified sales. <Link href="/affiliate" style={{ color: '#453577', fontWeight: 750 }}>Programme details</Link></div>}</div></div></> : null}</QueryState><style>{'@media(max-width:760px){.detail-grid{grid-template-columns:1fr!important}.detail-grid .tp-product-image{height:280px!important}}'}</style></div>;
}

function AffiliatePage() {
  const overview = useGetAffiliateOverview();
  const links = useListAffiliateLinks();
  const products = useListProducts({ type: 'physical', page: 1, pageSize: 48 });
  const digital = useListProducts({ type: 'digital', page: 1, pageSize: 48 });
  const create = useCreateAffiliateLink();
  const client = useQueryClient();
  const [productId, setProductId] = useState('');
  const [notice, setNotice] = useState('');
  const allProducts = [...(products.data?.items || []), ...(digital.data?.items || [])].filter((p: any) => p.affiliateEligible);
  const makeLink = () => {
    if (!productId) return setNotice('Choose an eligible product first.');
    create.mutate({ data: { productId } }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListAffiliateLinksQueryKey() }); client.invalidateQueries({ queryKey: getGetAffiliateOverviewQueryKey() }); setNotice('Your tracking link is ready. Commission depends on qualifying verified sales.'); }, onError: () => setNotice('We could not create that link. Check eligibility or try later.') });
  };
  return <div className="tp-container" style={{ padding: '40px 0' }}><SectionTitle eyebrow="Promote real products" title="Affiliate programme" body="Share eligible TaskPay products through your own channels. Commissions are tied to qualifying, verified sales—not recruitment. Income is not guaranteed." />
    <QueryState query={overview}><>{overview.data && <div className="metric-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 13, marginBottom: 20 }}>{[['Status', <Status value={overview.data.status} />], ['Tracked clicks', overview.data.clicks], ['Verified conversions', overview.data.conversions], ['Approved commission', money(overview.data.approvedCommissionMinor, overview.data.currency)]].map(([label,value]: any) => <div className="tp-card" key={label} style={{ padding: 18 }}><div className="tp-muted" style={{ fontSize: 12 }}>{label}</div><div style={{ fontSize: 21, fontWeight: 800, marginTop: 8 }}>{value}</div></div>)}</div>}
      <div className="affiliate-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16 }}><div className="tp-card" style={{ padding: 22 }}><h3 style={{ margin: '0 0 6px' }}>Create a tracking link</h3><p className="tp-muted" style={{ fontSize: 13, lineHeight: 1.6 }}>Only currently eligible listings can be promoted.</p><label className="tp-label">Eligible product<select className="tp-input" value={productId} onChange={e => setProductId(e.target.value)} data-testid="select-affiliate-product"><option value="">Choose product</option>{allProducts.map((p: any) => <option value={p.id} key={p.id}>{p.title}</option>)}</select></label><button className="tp-btn" style={{ marginTop: 14 }} onClick={makeLink} disabled={create.isPending} data-testid="button-create-affiliate-link">{create.isPending ? 'Creating…' : 'Create link'} <ArrowRight size={15} /></button>{notice && <div style={{ marginTop: 13 }}><Notice text={notice} /></div>}</div><div className="tp-card" style={{ padding: 22 }}><h3 style={{ margin: '0 0 13px' }}>Your links</h3><QueryState query={links} empty={!links.data?.length}>{links.data?.length ? <div style={{ display: 'grid', gap: 11 }}>{links.data.map((item: any) => <div key={item.id} style={{ padding: 13, background: '#f7f7f3', borderRadius: 11, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }} data-testid={`affiliate-link-${item.id}`}><div><strong style={{ fontSize: 14 }}>{item.productTitle}</strong><div className="tp-muted" style={{ fontSize: 11, marginTop: 5 }}>{item.clickCount} clicks · {item.conversionCount} conversions</div></div><button className="tp-btn tp-btn-outline" onClick={() => { navigator.clipboard?.writeText(item.url); setNotice('Link copied to clipboard.'); }} data-testid={`button-copy-link-${item.id}`}>Copy link</button></div>)}</div> : null}</QueryState></div></div>
      {overview.data && <p className="tp-muted" style={{ fontSize: 12, marginTop: 18 }}>Pending commission: {money(overview.data.pendingCommissionMinor, overview.data.currency)}. Pending amounts are not withdrawable. Orders may be reviewed, cancelled or reversed before approval.</p>}</>
    </QueryState><style>{'@media(max-width:760px){.metric-grid{grid-template-columns:repeat(2,1fr)!important}.affiliate-grid{grid-template-columns:1fr!important}}'}</style></div>;
}

function CampaignPage() {
  const campaigns = useListCampaigns({});
  const submissions = useListMyCampaignSubmissions();
  const apply = useApplyToCampaign();
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const list = (campaigns.data || []).filter((c: any) => `${c.title} ${c.businessName}`.toLowerCase().includes(search.toLowerCase()));
  const submitApplication = (id: string) => apply.mutate({ campaignId: id }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListMyCampaignSubmissionsQueryKey() }); setNotice('Application submitted. Check your submissions for status updates. Applying does not guarantee selection or payment.'); }, onError: () => setNotice('Could not submit your application. Please sign in or try again.') });
  return <div className="tp-container" style={{ padding: '42px 0' }}><SectionTitle eyebrow="Work with brands" title="Promotional campaigns" body="Browse active briefs for genuine promotion, content and customer outreach. Review the deliverables and terms before applying." />
    <label className="tp-label" style={{ maxWidth: 480, marginBottom: 21 }}>Find a campaign<input className="tp-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search campaign or business" data-testid="input-campaign-search" /></label>{notice && <div style={{ marginBottom: 16 }}><Notice text={notice} /></div>}
    <QueryState query={campaigns} empty={!list.length}><div className="campaign-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>{list.map((c: any) => <article className="tp-card" key={c.id} style={{ padding: 22 }} data-testid={`card-campaign-${c.id}`}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span className="tp-eyebrow">{c.businessName}</span><Status value={c.status} /></div><h3 style={{ fontSize: 21, margin: '13px 0 7px' }}>{c.title}</h3><p className="tp-muted" style={{ lineHeight: 1.65, fontSize: 14 }}>{c.description}</p><div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', margin: '16px 0', fontSize: 13 }}><span><b>Objective</b><br />{c.objective}</span><span><b>Campaign budget</b><br />{money(c.budgetMinor, c.currency)}</span></div>{c.status === 'open' ? <button className="tp-btn" type="button" onClick={() => submitApplication(c.id)} disabled={apply.isPending} data-testid={`button-apply-campaign-${c.id}`}>{apply.isPending ? 'Submitting…' : 'Apply for this campaign'}</button> : <span className="tp-muted" style={{ fontSize: 13 }}>Applications are not open for this campaign.</span>}</article>)}</div></QueryState>
    <section style={{ marginTop: 42 }}><SectionTitle title="My applications" body="Submission decisions and work evidence are shown from your account records." /><QueryState query={submissions} empty={!submissions.data?.length}>{submissions.data?.length && <div className="tp-card" style={{ overflow: 'auto' }}>{submissions.data.map((s: any) => <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: 16, borderBottom: '1px solid #eeede7' }}><span>{s.campaignTitle}<small className="tp-muted" style={{ display: 'block', marginTop: 5 }}>Applied {dateLabel(s.submittedAt)}</small></span><Status value={s.status} /></div>)}</div>}</QueryState></section>
    <style>{'@media(max-width:760px){.campaign-grid{grid-template-columns:1fr!important}}'}</style></div>;
}

function LearnPage() {
  const courses = useListCourses({});
  const mine = useListMyEnrolments();
  const enrol = useEnrolInCourse();
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const enrolledIds = new Set((mine.data || []).map((e: any) => e.courseId));
  const handleEnrol = (courseId: string) => {
    if (enrolledIds.has(courseId)) return setMessage('You are already enrolled. Open your learning list below to continue.');
    enrol.mutate({ courseId }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListMyEnrolmentsQueryKey() }); setMessage('Enrolment status received. Paid course content is available only after verified purchase.'); }, onError: () => setMessage('We could not enrol you. Sign in or check payment configuration.') });
  };
  return <div className="tp-container" style={{ padding: '42px 0' }}><SectionTitle eyebrow="Digital learning" title="Skills for what’s next" body="Practical courses from creators. Course access depends on enrolment and verified purchase where payment is required." />
    {message && <div style={{ marginBottom: 16 }}><Notice text={message} /></div>}<QueryState query={courses} empty={!courses.data?.length}><div className="course-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>{courses.data?.map((c: any) => <CourseTile key={c.id} course={c} enrolled={enrolledIds.has(c.id)} onEnroll={() => handleEnrol(c.id)} />)}</div></QueryState>
    <section style={{ marginTop: 42 }}><SectionTitle title="My learning" body="Progress shown here comes from your enrolment record." /><QueryState query={mine} empty={!mine.data?.length}><div className="tp-card">{mine.data?.map((e: any) => <div key={e.id} style={{ padding: 16, borderBottom: '1px solid #efeee9', display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center' }}><div><strong>{e.courseTitle}</strong><div className="tp-muted" style={{ fontSize: 12, marginTop: 5 }}>{e.progressPercent}% complete</div></div><Status value={e.status} /></div>)}</div></QueryState></section>
    <style>{'@media(max-width:760px){.course-grid{grid-template-columns:1fr!important}}'}</style></div>;
}

function EventsPage() {
  const events = useListEvents({});
  const [search, setSearch] = useState('');
  const list = (events.data || []).filter((e: any) => `${e.title} ${e.city} ${e.categoryId}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="tp-container" style={{ padding: '42px 0' }}><SectionTitle eyebrow="Meet, learn, share" title="Events around you" body="Discover public events, workshops and gatherings. Ticket purchase status is confirmed by the platform—not by this page." /><label className="tp-label" style={{ maxWidth: 450, marginBottom: 22 }}>Search events<input className="tp-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Event, city or category" data-testid="input-event-search" /></label><QueryState query={events} empty={!list.length}><div className="event-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>{list.map((e: any) => <Link key={e.id} href={`/events/${e.id}`} style={{ textDecoration: 'none', color: '#172744' }}><EventTile event={e} /></Link>)}</div></QueryState><div style={{ marginTop: 22 }}><Link href="/events/tickets" className="tp-btn tp-btn-outline">My tickets <Ticket size={16} /></Link></div><style>{'@media(max-width:760px){.event-grid{grid-template-columns:1fr!important}}'}</style></div>;
}
function EventDetail() {
  const { eventId = '' } = useParams();
  const list = useListEvents({});
  const buy = usePurchaseTicket();
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const event = list.data?.find((e: any) => e.id === eventId);
  return <div className="tp-container" style={{ padding: '42px 0' }}><QueryState query={list}>{event ? <div className="tp-card" style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}><div className="tp-product-image" style={{ height: 340 }}>{event.imageUrl ? <img src={event.imageUrl} alt={event.title} /> : <CalendarDays size={48} />}</div><div><div className="tp-eyebrow">{dateLabel(event.startsAt)} · {event.city}, {event.country}</div><h1 style={{ fontSize: 34 }}>{event.title}</h1><p className="tp-muted" style={{ lineHeight: 1.7 }}>{event.description}</p><div className="tp-card" style={{ padding: 16, margin: '18px 0' }}><strong>{event.venue}</strong><div className="tp-muted" style={{ marginTop: 5 }}>{event.city}, {event.country}</div><div style={{ marginTop: 13 }}>Tickets from <strong>{money(event.lowestPriceMinor, event.currency)}</strong></div></div><button className="tp-btn" onClick={() => buy.mutate({ eventId, data: { quantity: 1 } }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListMyTicketsQueryKey() }); setMessage('Ticket request received. Check ticket status and payment state in My tickets; do not treat this request as a confirmed ticket.'); }, onError: () => setMessage('Ticket request could not be completed. Payment availability or sign-in may be required.') })} disabled={buy.isPending} data-testid="button-purchase-ticket">{buy.isPending ? 'Requesting…' : 'Request 1 ticket'}</button>{message && <div style={{ marginTop: 14 }}><Notice text={message} /></div>}</div></div> : <StateBlock title="Event details are unavailable" body="This event may have been removed or the event catalogue did not load." />}</QueryState><style>{'@media(max-width:760px){.tp-card[style*=\"grid-template-columns\"]{grid-template-columns:1fr!important}}'}</style></div>;
}
function TicketsPage() {
  const tickets = useListMyTickets();
  return <div className="tp-container" style={{ padding: '42px 0' }}><SectionTitle eyebrow="Your event access" title="My tickets" body="Only tickets confirmed in your account record are shown here." /><QueryState query={tickets} empty={!tickets.data?.length}><div className="tp-card">{tickets.data?.map((ticket: any) => <div key={ticket.id} style={{ padding: 19, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', borderBottom: '1px solid #eeede7' }} data-testid={`ticket-${ticket.id}`}><div><strong>{ticket.eventTitle}</strong><div className="tp-muted" style={{ fontSize: 12, marginTop: 5 }}>Ticket ID · {ticket.ticketIdentifier}</div></div><Status value={ticket.status} /></div>)}</div></QueryState></div>;
}

function VendorPage() {
  const vendor = useGetMyVendor();
  const apply = useApplyAsVendor();
  const client = useQueryClient();
  const [notice, setNotice] = useState('');
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const data = { storeName: String(f.get('storeName')), description: String(f.get('description')), country: String(f.get('country')), city: String(f.get('city')), logoUrl: String(f.get('logoUrl') || '') || null, contactPhone: String(f.get('contactPhone')) };
    apply.mutate({ data }, { onSuccess: () => { client.invalidateQueries({ queryKey: getGetMyVendorQueryKey() }); setNotice('Application submitted for review. Product listing access depends on vendor approval.'); }, onError: () => setNotice('Your application could not be submitted. Check each field and try again.') });
  }
  return <div className="tp-container" style={{ padding: '42px 0' }}><SectionTitle eyebrow="Sell on TaskPay" title="Bring your business online" body="Tell us about your store. Vendor applications are reviewed before product listing access is enabled." />
    <QueryState query={vendor}>{vendor.data ? <div className="tp-card" style={{ padding: 25, maxWidth: 700 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>{vendor.data.storeName}</h3><Status value={vendor.data.status} /></div><p className="tp-muted">{vendor.data.description}</p><div>{vendor.data.city}, {vendor.data.country}</div><Link href="/vendor/products" className="tp-btn" style={{ marginTop: 18 }}>Manage products <ArrowRight size={16} /></Link></div> : <form onSubmit={submit} className="tp-card" style={{ padding: 25, maxWidth: 710, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}><label className="tp-label">Store name<input className="tp-input" name="storeName" required minLength={2} maxLength={160} data-testid="input-store-name" /></label><label className="tp-label">Contact phone<input className="tp-input" name="contactPhone" required minLength={7} maxLength={40} placeholder="+233…" data-testid="input-store-phone" /></label><label className="tp-label">Country<input className="tp-input" name="country" required minLength={2} defaultValue="Ghana" data-testid="input-store-country" /></label><label className="tp-label">City<input className="tp-input" name="city" required minLength={2} data-testid="input-store-city" /></label><label className="tp-label" style={{ gridColumn: '1/-1' }}>Business description<textarea className="tp-input" name="description" required minLength={20} maxLength={4000} style={{ height: 100, padding: 12 }} data-testid="input-store-description" /></label><label className="tp-label" style={{ gridColumn: '1/-1' }}>Logo URL (optional)<input className="tp-input" type="url" name="logoUrl" data-testid="input-store-logo" /></label><div style={{ gridColumn: '1/-1' }}><button className="tp-btn" disabled={apply.isPending} data-testid="button-submit-vendor">{apply.isPending ? 'Submitting…' : 'Submit application'}</button></div>{notice && <div style={{ gridColumn: '1/-1' }}><Notice text={notice} /></div>}</form>}</QueryState>
  </div>;
}
function VendorProductsPage() {
  const vendor = useGetMyVendor();
  const mine = useListMyProducts();
  const categoriesPhysical = useListCategories({ type: 'physical' });
  const categoriesDigital = useListCategories({ type: 'digital' });
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const archive = useArchiveProduct();
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); const type = String(f.get('type')) as 'physical' | 'digital';
    create.mutate({ data: { title: String(f.get('title')), description: String(f.get('description')), type, categoryId: String(f.get('categoryId')), priceMinor: Math.round(Number(f.get('price')) * 100), imageUrl: String(f.get('imageUrl') || '') || null, stockQuantity: type === 'physical' ? Number(f.get('stock') || 0) : null, deliverySummary: type === 'physical' ? String(f.get('delivery') || '') || null : null } }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListMyProductsQueryKey() }); setMessage('Product submitted. Publication status is shown in your product list.'); setOpen(false); }, onError: () => setMessage('Could not create the product. Check your vendor approval and fields.') });
  }
  const categories = [...(categoriesPhysical.data || []), ...(categoriesDigital.data || [])];
  return <div className="tp-container" style={{ padding: '40px 0' }}><SectionTitle eyebrow="Vendor workspace" title="Your products" body="Manage product listings in the categories available to your account." action={<button className="tp-btn" onClick={() => setOpen(!open)} data-testid="button-add-product"><Package size={16} /> Add product</button>} />
    {vendor.data?.status !== 'approved' && <div style={{ marginBottom: 16 }}><Notice text="Your vendor profile must be approved before you can create public listings." /></div>}
    {message && <div style={{ marginBottom: 15 }}><Notice text={message} /></div>}
    {open && <form onSubmit={submit} className="tp-card" style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13, marginBottom: 20 }}><label className="tp-label">Product title<input name="title" className="tp-input" required minLength={2} data-testid="input-product-title" /></label><label className="tp-label">Product type<select name="type" className="tp-input" data-testid="select-product-type"><option value="physical">Physical product</option><option value="digital">Digital product</option></select></label><label className="tp-label">Category<select name="categoryId" className="tp-input" required data-testid="select-product-category-create"><option value="">Choose category</option>{categories.map((c: any) => <option value={c.id} key={c.id}>{c.name} · {c.type}</option>)}</select></label><label className="tp-label">Price (GHS)<input name="price" className="tp-input" type="number" min="0.01" step="0.01" required data-testid="input-product-price" /></label><label className="tp-label" style={{ gridColumn: '1/-1' }}>Description<textarea name="description" className="tp-input" style={{ height: 90, padding: 12 }} minLength={10} required data-testid="input-product-description" /></label><label className="tp-label">Image URL<input name="imageUrl" className="tp-input" type="url" data-testid="input-product-image" /></label><label className="tp-label">Stock (physical)<input name="stock" className="tp-input" type="number" min="0" data-testid="input-product-stock" /></label><label className="tp-label" style={{ gridColumn: '1/-1' }}>Delivery summary (physical)<input name="delivery" className="tp-input" data-testid="input-product-delivery" /></label><button className="tp-btn" disabled={create.isPending || vendor.data?.status !== 'approved'} data-testid="button-save-product">{create.isPending ? 'Saving…' : 'Submit listing'}</button><button className="tp-btn tp-btn-outline" type="button" onClick={() => setOpen(false)}>Cancel</button></form>}
    <QueryState query={mine} empty={!mine.data?.length}><div className="tp-card">{mine.data?.map((p: any) => <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: 16, borderBottom: '1px solid #eeede7' }} data-testid={`vendor-product-${p.id}`}><div><strong>{p.title}</strong><div className="tp-muted" style={{ fontSize: 12, marginTop: 5 }}>{p.type} · {money(p.priceMinor, p.currency)}</div></div><div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><Status value={p.status} /><button className="tp-btn tp-btn-outline" onClick={() => { const title = prompt('Update product title:', p.title); if (title && title.trim() !== p.title) update.mutate({ productId: p.id, data: { title: title.trim() } }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListMyProductsQueryKey() }); setMessage('Product title updated.'); }, onError: () => setMessage('Could not update product.') }); }} data-testid={`button-edit-${p.id}`}>Edit title</button><button className="tp-btn tp-btn-outline" onClick={() => { if (confirm(`Archive “${p.title}”?`)) archive.mutate({ productId: p.id }, { onSuccess: () => client.invalidateQueries({ queryKey: getListMyProductsQueryKey() }), onError: () => setMessage('Could not archive the listing.') }); }} data-testid={`button-archive-${p.id}`}>Archive</button></div></div>)}</div></QueryState>
    <style>{'@media(max-width:760px){.tp-card[style*=\"grid-template-columns\"]{grid-template-columns:1fr!important}}'}</style></div>;
}

function DashboardPage() {
  const dashboard = useGetDashboard();
  const [location] = useLocation();
  const cards = [['Shop', 'Explore physical products', '/shop', ShoppingBag], ['Digital goods', 'Templates and more', '/digital', Package], ['Affiliate', 'Promote eligible products', '/affiliate', Zap], ['Campaigns', 'Apply to brand briefs', '/campaigns', BriefcaseBusiness], ['Learning', 'Course catalogue', '/learn', GraduationCap], ['Events', 'Tickets and gatherings', '/events', Ticket]];
  return <div className="tp-container" style={{ padding: '40px 0' }}><QueryState query={dashboard}>{dashboard.data && <><div className="tp-hero" style={{ padding: 30, marginBottom: 22 }}><div className="tp-eyebrow" style={{ color: '#f4c552' }}>Your TaskPay space</div><h1 style={{ margin: '8px 0', fontSize: 35 }}>Good to see you, {dashboard.data.user.fullName.split(' ')[0]}.</h1><p style={{ color: '#d7dfeb', margin: 0 }}>Your orders, learning and opportunities in one place.</p></div><div className="dashboard-actions" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 13 }}>{cards.map(([title,desc,href,Icon]: any) => <Link key={href} href={href} className="tp-card" style={{ padding: 18, textDecoration: 'none', color: '#172744' }} data-testid={`dashboard-shortcut-${title.toLowerCase()}`}><Icon color="#36766e" size={21} /><h3 style={{ margin: '12px 0 5px' }}>{title}</h3><span className="tp-muted" style={{ fontSize: 13 }}>{desc}</span></Link>)}</div><section style={{ marginTop: 28 }}><SectionTitle title="Recent orders" action={<Link href="/account/orders" className="tp-btn tp-btn-outline">All orders</Link>} />{dashboard.data.recentOrders?.length ? <div className="tp-card">{dashboard.data.recentOrders.map((o: any) => <div key={o.id} style={{ padding: 16, display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid #eeede7' }}><span><strong>{o.orderNumber}</strong><small className="tp-muted" style={{ display: 'block', marginTop: 5 }}>{o.itemCount} items · {dateLabel(o.createdAt)}</small></span><span style={{ display: 'flex', gap: 12, alignItems: 'center' }}><strong>{money(o.totalMinor, o.currency)}</strong><Status value={o.paymentStatus} /></span></div>)}</div> : <StateBlock title="No orders yet" body="Orders will appear here after a checkout request is recorded." />}</section></>}</QueryState><style>{'@media(max-width:760px){.dashboard-actions{grid-template-columns:repeat(2,1fr)!important}}'}</style></div>;
}

function AccountPage() {
  const { section = 'profile' } = useParams();
  const me = useGetMe();
  const cart = useGetCart();
  const orders = useListMyOrders();
  const wallet = useGetWallet();
  const update = useUpdateMe();
  const remove = useRemoveCartItem();
  const checkout = useBeginCheckout();
  const payout = useRequestPayout();
  const support = useCreateSupportRequest();
  const client = useQueryClient();
  const [notice, setNotice] = useState('');
  const nav = [['profile', 'Profile'], ['cart', 'Cart'], ['orders', 'Orders'], ['wallet', 'Wallet'], ['support', 'Support']];
  function handleForm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    if (section === 'profile') update.mutate({ data: { fullName: String(f.get('fullName')), phone: String(f.get('phone')) || null } }, { onSuccess: () => { client.invalidateQueries({ queryKey: getGetMeQueryKey() }); setNotice('Profile updated.'); }, onError: () => setNotice('Could not update your profile.') });
    if (section === 'wallet') payout.mutate({ data: { amountMinor: Math.round(Number(f.get('amount')) * 100), method: String(f.get('method')) as 'mobile_money' | 'bank_transfer', destination: String(f.get('destination')) } }, { onSuccess: () => { client.invalidateQueries({ queryKey: getGetWalletQueryKey() }); setNotice('Payout request submitted. This is a request only; it is not confirmation of a completed payout.'); }, onError: () => setNotice('Payout request could not be submitted. Check eligibility and minimum amount.') });
    if (section === 'support') support.mutate({ data: { subject: String(f.get('subject')), message: String(f.get('message')) } }, { onSuccess: () => { setNotice('Support request sent.'); e.currentTarget.reset(); }, onError: () => setNotice('Support request could not be sent.') });
  }
  const removeItem = (id: string) => remove.mutate({ itemId: id }, { onSuccess: () => client.invalidateQueries({ queryKey: getGetCartQueryKey() }), onError: () => setNotice('Could not remove item from cart.') });
  const checkoutCart = () => checkout.mutate({ data: {} }, { onSuccess: (result: any) => { client.invalidateQueries({ queryKey: getGetCartQueryKey() }); client.invalidateQueries({ queryKey: getListMyOrdersQueryKey() }); setNotice(`Checkout status: ${result.paymentStatus}. ${result.message || 'Payment is not marked complete until verified.'}`); }, onError: () => setNotice('Checkout could not be started. Payment configuration may be unavailable.') });
  const title = nav.find(([key]) => key === section)?.[1] || 'Account';
  return <div className="tp-container" style={{ padding: '40px 0' }}><SectionTitle eyebrow="Your account" title={title} body="Manage account details and review activity linked to your TaskPay profile." />
    <div className="account-layout" style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 18 }}><nav className="tp-card" style={{ padding: 9, alignSelf: 'start' }}>{nav.map(([key,label]) => <Link key={key} href={`/account/${key}`} style={{ display: 'block', padding: 12, margin: 2, borderRadius: 9, textDecoration: 'none', color: section === key ? '#172744' : '#728095', background: section === key ? '#f4f1e7' : 'transparent', fontWeight: 700 }} data-testid={`account-tab-${key}`}>{label}</Link>)}</nav>
    <div>
      {notice && <div style={{ marginBottom: 13 }}><Notice text={notice} /></div>}
      {section === 'profile' && <QueryState query={me}>{me.data && <form className="tp-card" onSubmit={handleForm} style={{ padding: 22, display: 'grid', gap: 14, maxWidth: 650 }}><label className="tp-label">Full name<input className="tp-input" name="fullName" defaultValue={me.data.fullName} required minLength={1} data-testid="input-profile-name" /></label><label className="tp-label">Email address<input className="tp-input" value={me.data.email} readOnly data-testid="input-profile-email" /></label><label className="tp-label">Phone<input className="tp-input" name="phone" defaultValue={me.data.phone || ''} placeholder="+233…" data-testid="input-profile-phone" /></label><div><button className="tp-btn" disabled={update.isPending} data-testid="button-save-profile">{update.isPending ? 'Saving…' : 'Save profile'}</button></div></form>}</QueryState>}
      {section === 'cart' && <QueryState query={cart} empty={!cart.data?.items?.length}>{cart.data?.items?.length ? <div className="tp-card" style={{ padding: 18 }}><div style={{ display: 'grid', gap: 11 }}>{cart.data.items.map((item: any) => <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: 10, borderBottom: '1px solid #eeede7' }}><div><strong>{item.title}</strong><div className="tp-muted" style={{ fontSize: 12 }}>{item.type} · Qty {item.quantity}</div></div><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><strong>{money(item.priceMinor * item.quantity, cart.data.currency)}</strong><button className="tp-btn tp-btn-outline" onClick={() => removeItem(item.id)} data-testid={`button-remove-cart-${item.id}`}>Remove</button></div></div>)}</div><div style={{ display: 'flex', justifyContent: 'space-between', padding: '17px 5px' }}><strong>Subtotal</strong><strong>{money(cart.data.subtotalMinor, cart.data.currency)}</strong></div><button className="tp-btn" onClick={checkoutCart} disabled={checkout.isPending} data-testid="button-begin-checkout">{checkout.isPending ? 'Starting…' : 'Continue to checkout'} <ArrowRight size={15} /></button><div className="tp-muted" style={{ fontSize: 12, marginTop: 12 }}>Payment completion is determined by verified platform status. No payment will be assumed from this action.</div></div> : null}</QueryState>}
      {section === 'orders' && <QueryState query={orders} empty={!orders.data?.length}>{orders.data?.length ? <div className="tp-card">{orders.data.map((o: any) => <div key={o.id} style={{ padding: 16, borderBottom: '1px solid #eeede7', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><strong>{o.orderNumber}</strong><div className="tp-muted" style={{ fontSize: 12, marginTop: 4 }}>{o.itemCount} items · {dateLabel(o.createdAt)}</div></div><div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><strong>{money(o.totalMinor, o.currency)}</strong><Status value={o.paymentStatus} /></div></div>)}</div> : null}</QueryState>}
      {section === 'wallet' && <QueryState query={wallet}>{wallet.data && <><div className="tp-wallet-cards" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}><div className="tp-card" style={{ padding: 20 }}><div className="tp-muted">Available balance</div><h2>{money(wallet.data.availableMinor, wallet.data.currency)}</h2><div className="tp-muted" style={{ fontSize: 12 }}>Eligible funds only</div></div><div className="tp-card" style={{ padding: 20 }}><div className="tp-muted">Pending balance</div><h2>{money(wallet.data.pendingMinor, wallet.data.currency)}</h2><div className="tp-muted" style={{ fontSize: 12 }}>Not available for payout</div></div></div><form className="tp-card" onSubmit={handleForm} style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><h3 style={{ gridColumn: '1/-1', margin: 0 }}>Request a payout</h3><label className="tp-label">Amount (GHS)<input className="tp-input" name="amount" type="number" step="0.01" min="0.01" required data-testid="input-payout-amount" /></label><label className="tp-label">Method<select className="tp-input" name="method" data-testid="select-payout-method"><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank transfer</option></select></label><label className="tp-label" style={{ gridColumn: '1/-1' }}>Destination details<input className="tp-input" name="destination" required minLength={3} data-testid="input-payout-destination" /></label><button className="tp-btn" disabled={payout.isPending} data-testid="button-request-payout">{payout.isPending ? 'Submitting…' : 'Request payout'}</button></form><div style={{ marginTop: 19 }}><h3>Payout requests</h3>{wallet.data.payouts?.length ? <div className="tp-card">{wallet.data.payouts.map((p: any) => <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 14, borderBottom: '1px solid #eeede7' }}><span>{money(p.amountMinor, p.currency)}<small className="tp-muted" style={{ display: 'block' }}>{dateLabel(p.createdAt)}</small></span><Status value={p.status} /></div>)}</div> : <StateBlock title="No payout requests" body="Payout requests will appear here when submitted." />}</div></>}</QueryState>}
      {section === 'support' && <form onSubmit={handleForm} className="tp-card" style={{ padding: 22, display: 'grid', gap: 13, maxWidth: 700 }}><div><Headphones size={22} color="#33776c" /><h3 style={{ margin: '8px 0' }}>How can we help?</h3><p className="tp-muted" style={{ fontSize: 13 }}>Send a support request. Do not include passwords, card numbers or secret credentials.</p></div><label className="tp-label">Subject<input className="tp-input" name="subject" required minLength={3} maxLength={180} data-testid="input-support-subject" /></label><label className="tp-label">Message<textarea className="tp-input" name="message" required minLength={10} maxLength={5000} style={{ height: 130, padding: 12 }} data-testid="input-support-message" /></label><button className="tp-btn" disabled={support.isPending} data-testid="button-submit-support">{support.isPending ? 'Sending…' : 'Send request'}</button></form>}
    </div></div><style>{'@media(max-width:760px){.account-layout{grid-template-columns:1fr!important}.account-layout nav{display:flex;overflow:auto}.account-layout nav a{white-space:nowrap}.tp-wallet-cards{grid-template-columns:1fr!important}}'}</style></div>;
}

function AdminLogin() {
  return <div className="tp-container" style={{ padding: '70px 0' }}><div className="tp-card" style={{ maxWidth: 530, margin: '0 auto', padding: 30, textAlign: 'center' }}><ShieldCheck size={30} color="#36766e" /><div className="tp-eyebrow" style={{ marginTop: 13 }}>Restricted access</div><h1 style={{ fontSize: 30 }}>Administrator entry</h1><p className="tp-muted" style={{ lineHeight: 1.65 }}>Sign in with an authorised TaskPay administrator account. Access is enforced by the server; an ordinary account cannot access admin records.</p><Link href="/sign-in" className="tp-btn" data-testid="button-admin-sign-in">Continue to secure sign in <ArrowRight size={16} /></Link></div></div>;
}
function AuthGate({ children }: { children: ReactNode }) {
  return <><Show when="signed-in">{children}</Show><Show when="signed-out"><div className="tp-container" style={{ padding: '76px 0' }}><div className="tp-card" style={{ maxWidth: 540, margin: '0 auto', padding: 30, textAlign: 'center' }}><ShieldCheck size={28} color="#36766e" /><h2>Sign in to continue</h2><p className="tp-muted" style={{ lineHeight: 1.65 }}>This part of TaskPay is connected to your account. Your records stay private and are only shown after you sign in.</p><Link href="/sign-in" className="tp-btn" data-testid="button-auth-gate">Sign in securely</Link></div></div></Show></>;
}
function AdminWorkspace() {
  const [area, setArea] = useState<'users' | 'vendors' | 'products' | 'orders' | 'campaigns' | 'courses' | 'events' | 'payouts' | 'support'>('vendors');
  const summary = useGetAdminSummary();
  const records = useListAdminRecords(area);
  const settings = useGetAdminSettings();
  const review = useReviewAdminRecord();
  const updateSettings = useUpdateAdminSettings();
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState('summary');
  const areas: typeof area[] = ['users', 'vendors', 'products', 'orders', 'campaigns', 'courses', 'events', 'payouts', 'support'];
  const reviewItem = (item: any, status: string) => {
    const reason = prompt(`Reason for setting status to ${status}:`);
    if (!reason || reason.trim().length < 3) return;
    review.mutate({ recordType: area, recordId: item.id, data: { status, reason } }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListAdminRecordsQueryKey(area) }); client.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() }); setMessage(`${item.title} status updated.`); }, onError: () => setMessage('This review could not be completed. Check your admin permissions.') });
  };
  const saveSettings = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = new FormData(e.currentTarget); updateSettings.mutate({ data: { vendorMembershipMinor: Math.round(Number(f.get('membership')) * 100), vendorMembershipDays: Number(f.get('membershipDays')), salesCommissionBps: Number(f.get('salesFee')), affiliateDefaultBps: Number(f.get('affiliateFee')), campaignFeeBps: Number(f.get('campaignFee')), courseCommissionBps: Number(f.get('courseFee')), ticketFeeBps: Number(f.get('ticketFee')), minimumPayoutMinor: Math.round(Number(f.get('minimumPayout')) * 100) } }, { onSuccess: () => { client.invalidateQueries({ queryKey: getGetAdminSettingsQueryKey() }); setMessage('Platform settings saved.'); }, onError: () => setMessage('Settings were not saved. Please check the values and your access.') }); };
  const tabs = [['summary', 'Summary'], ['records', 'Records'], ['settings', 'Settings']];
  return <div className="tp-container" style={{ padding: '36px 0' }}><div className="tp-eyebrow">TaskPay administration</div><h1 style={{ fontSize: 38, margin: '7px 0 17px' }}>Platform operations</h1>{message && <div style={{ marginBottom: 14 }}><Notice text={message} /></div>}
    <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #e7e5de', marginBottom: 20 }}>{tabs.map(([key,label]) => <button key={key} onClick={() => setTab(key)} style={{ border: 0, borderBottom: tab === key ? '2px solid #d9a31c' : '2px solid transparent', background: 'transparent', padding: '10px 14px', fontWeight: 750, color: '#25334b', cursor: 'pointer' }} data-testid={`admin-tab-${key}`}>{label}</button>)}</div>
    {tab === 'summary' && <QueryState query={summary}>{summary.data && <><div className="admin-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>{[['Users', summary.data.users], ['Vendors', summary.data.vendors], ['Pending vendors', summary.data.pendingVendors], ['Products', summary.data.products], ['Pending products', summary.data.pendingProducts], ['Orders', summary.data.orders], ['Confirmed volume', money(summary.data.paidVolumeMinor, summary.data.currency)], ['Platform revenue', money(summary.data.platformRevenueMinor, summary.data.currency)], ['Pending payouts', summary.data.pendingPayouts], ['Campaigns', summary.data.campaigns], ['Pending submissions', summary.data.pendingSubmissions], ['Courses', summary.data.courses], ['Events', summary.data.events], ['Tickets sold', summary.data.ticketsSold]].map(([label,value]: any) => <div className="tp-card" key={label} style={{ padding: 17 }}><div className="tp-muted" style={{ fontSize: 12 }}>{label}</div><div style={{ fontSize: 23, marginTop: 8, fontWeight: 800 }}>{value}</div></div>)}</div><p className="tp-muted" style={{ fontSize: 12, marginTop: 13 }}>Figures reflect database-backed API records. Confirmed volume and platform revenue are shown separately; neither represents a withdrawable user balance.</p></>}</QueryState>}
    {tab === 'records' && <><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>{areas.map(a => <button key={a} className={`tp-btn ${a === area ? '' : 'tp-btn-outline'}`} style={{ padding: '8px 12px', fontSize: 12 }} onClick={() => setArea(a)} data-testid={`admin-area-${a}`}>{a}</button>)}</div><QueryState query={records} empty={!records.data?.length}><div className="tp-card" style={{ overflow: 'auto' }}>{records.data?.map((r: any) => <div key={r.id} style={{ padding: 16, borderBottom: '1px solid #eeede7', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }} data-testid={`admin-record-${r.id}`}><div><strong>{r.title}</strong><div className="tp-muted" style={{ fontSize: 12, marginTop: 4 }}>{r.ownerName || r.recordType} · {r.detail || dateLabel(r.createdAt)}</div></div><div style={{ display: 'flex', gap: 9, alignItems: 'center' }}><Status value={r.status} />{['pending','pending_review','applied'].includes(r.status) && <><button className="tp-btn" style={{ padding: '8px 11px', fontSize: 12 }} onClick={() => reviewItem(r, 'approved')} data-testid={`button-approve-${r.id}`}>Approve</button><button className="tp-btn tp-btn-outline" style={{ padding: '8px 11px', fontSize: 12 }} onClick={() => reviewItem(r, 'rejected')} data-testid={`button-reject-${r.id}`}>Reject</button></>}</div></div>)}</div></QueryState></>}
    {tab === 'settings' && <QueryState query={settings}>{settings.data && <form className="tp-card settings-grid" onSubmit={saveSettings} style={{ padding: 22, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13, maxWidth: 800 }}><div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>Platform settings</h3><Status value={settings.data.paymentStatus} /></div>{[['membership','Vendor membership (GHS)',settings.data.vendorMembershipMinor/100],['membershipDays','Membership duration (days)',settings.data.vendorMembershipDays],['salesFee','Sales commission (basis points)',settings.data.salesCommissionBps],['affiliateFee','Affiliate default (basis points)',settings.data.affiliateDefaultBps],['campaignFee','Campaign fee (basis points)',settings.data.campaignFeeBps],['courseFee','Course commission (basis points)',settings.data.courseCommissionBps],['ticketFee','Ticket fee (basis points)',settings.data.ticketFeeBps],['minimumPayout','Minimum payout (GHS)',settings.data.minimumPayoutMinor/100]].map(([name,label,value]: any) => <label className="tp-label" key={name}>{label}<input className="tp-input" name={name} type="number" min="0" step={name.toLowerCase().includes('fee') ? 1 : .01} defaultValue={value} required data-testid={`input-setting-${name}`} /></label>)}<button className="tp-btn" disabled={updateSettings.isPending} data-testid="button-save-settings">{updateSettings.isPending ? 'Saving…' : 'Save settings'}</button><div className="tp-muted" style={{ alignSelf: 'center', fontSize: 12 }}>Fee rates use basis points. Payment status is managed by platform configuration.</div></form>}</QueryState>}
    <style>{'@media(max-width:760px){.admin-metrics{grid-template-columns:repeat(2,1fr)!important}.settings-grid{grid-template-columns:1fr!important}.settings-grid>div:first-child{grid-column:auto!important}}'}</style></div>;
}
function AdminPage() {
  const me = useGetMe();
  if (me.isLoading) return <div className="tp-container" style={{ padding: 60 }}><div className="tp-skeleton" style={{ height: 180 }} /></div>;
  if (me.isError || !me.data) return <div className="tp-container" style={{ padding: 60 }}><StateBlock title="Administrator access required" body="Sign in with an authorised administrator account. The server enforces permissions for all administrative data." /></div>;
  if (!me.data.roles.some(role => ['admin', 'administrator'].includes(role.toLowerCase()))) return <div className="tp-container" style={{ padding: 60 }}><StateBlock title="This account is not an administrator" body="Your account does not have administrator permissions. Contact the platform team if you believe this is an error." /></div>;
  return <AdminWorkspace />;
}
function HomeRedirect() { return <><Show when="signed-in"><Redirect to="/dashboard" /></Show><Show when="signed-out"><HomePage /></Show></>; }
function SignInPage() { return <div style={{ minHeight: 'calc(100dvh - 76px)', display: 'grid', placeItems: 'center', padding: 24 }}><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>; }
function SignUpPage() { return <div style={{ minHeight: 'calc(100dvh - 76px)', display: 'grid', placeItems: 'center', padding: 24 }}><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>; }
function Logout() { const { signOut } = useClerk(); return <button className="tp-btn tp-btn-outline" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-logout">Log out</button>; }
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk(); const client = useQueryClient(); const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => { const unsubscribe = addListener(({ user }) => { const userId = user?.id ?? null; if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) client.clear(); prevUserIdRef.current = userId; }); return unsubscribe; }, [addListener, client]);
  return null;
}
function ClerkRouteProvider() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to your TaskPay account' } }, signUp: { start: { title: 'Create your TaskPay account', subtitle: 'Join a trusted commerce and learning community' } } }}
    routerPush={to => setLocation(stripBase(to))} routerReplace={to => setLocation(stripBase(to), { replace: true })}>
    <QueryClientProvider client={queryClient}><TooltipProvider><ClerkQueryClientCacheInvalidator /><AppFrame><Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/shop">{() => <Catalogue type="physical" />}</Route>
      <Route path="/digital">{() => <Catalogue type="digital" />}</Route>
      <Route path="/products/:productId" component={ProductDetail} />
      <Route path="/affiliate">{() => <AuthGate><AffiliatePage /></AuthGate>}</Route>
      <Route path="/campaigns" component={CampaignPage} />
      <Route path="/learn" component={LearnPage} />
      <Route path="/events/tickets">{() => <AuthGate><TicketsPage /></AuthGate>}</Route>
      <Route path="/events/:eventId" component={EventDetail} />
      <Route path="/events" component={EventsPage} />
      <Route path="/account/:section?">{() => <AuthGate><AccountPage /></AuthGate>}</Route>
      <Route path="/vendor/products">{() => <AuthGate><VendorProductsPage /></AuthGate>}</Route>
      <Route path="/vendor">{() => <AuthGate><VendorPage /></AuthGate>}</Route>
      <Route path="/dashboard">{() => <AuthGate><DashboardPage /></AuthGate>}</Route>
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin">{() => <AuthGate><AdminPage /></AuthGate>}</Route>
      <Route path="/logout" component={Logout} />
      <Route><NotFound /></Route>
    </Switch></AppFrame><Toaster /></TooltipProvider></QueryClientProvider>
  </ClerkProvider>;
}
function NotFound() {
  return <div className="tp-container" style={{ padding: '90px 0', textAlign: 'center' }}><div className="tp-eyebrow">404 · Not found</div><h1 style={{ fontSize: 42 }}>This page isn’t here.</h1><p className="tp-muted">Find your way back to the TaskPay marketplace.</p><Link href="/" className="tp-btn">Back home</Link></div>;
}
function App() {
  return <WouterRouter base={basePath}><ClerkRouteProvider /></WouterRouter>;
}
export default App;
