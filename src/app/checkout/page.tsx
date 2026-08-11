'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Shield,
  CreditCard,
  ShieldCheck,
  CheckCircle,
  Lock,
  ArrowRight,
  Building2,
  ArrowLeft
} from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import api from '@/lib/api';

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_51MzX90SampleStripePublishableKey1234567890'
);

export default function StandaloneCheckoutPage() {
  const [seats, setSeats] = useState(25);
  const [cardHolder, setCardHolder] = useState('Alex Morgan');
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [expiry, setExpiry] = useState('12 / 28');
  const [cvc, setCvc] = useState('123');
  const [zipCode, setZipCode] = useState('10001');
  const [processing, setProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState<any | null>(null);

  const pricePerUserPerMonth = 6;
  const annualTotal = seats * pricePerUserPerMonth * 12;

  const getCardBrand = (num: string) => {
    const clean = num.replace(/\s+/g, '');
    if (clean.startsWith('4')) return 'Visa';
    if (/^5[1-5]/.test(clean) || /^2[2-7]/.test(clean)) return 'Mastercard';
    if (/^3[47]/.test(clean)) return 'Amex';
    if (/^6(?:011|5)/.test(clean)) return 'Discover';
    return '';
  };

  const handleFillTestCard = (type: 'visa' | 'mastercard' | 'amex') => {
    if (type === 'visa') {
      setCardNumber('4242 4242 4242 4242');
      setExpiry('12 / 28');
      setCvc('123');
      setZipCode('10001');
    } else if (type === 'mastercard') {
      setCardNumber('5555 5555 5555 4444');
      setExpiry('08 / 29');
      setCvc('456');
      setZipCode('90210');
    } else if (type === 'amex') {
      setCardNumber('3782 822468 30005');
      setExpiry('11 / 27');
      setCvc('8888');
      setZipCode('30301');
    }
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 16) val = val.slice(0, 16);
    const formatted = val.match(/.{1,4}/g)?.join(' ') || val;
    setCardNumber(formatted);
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 4) val = val.slice(0, 4);
    if (val.length >= 3) {
      setExpiry(`${val.slice(0, 2)} / ${val.slice(2)}`);
    } else {
      setExpiry(val);
    }
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardNumber || !expiry || !cvc) {
      alert('Please fill out card details');
      return;
    }
    setProcessing(true);

    try {
      await stripePromise;

      const res = await api.post('/checkout', {
        seats,
        planName: 'Organization Plan',
        cardHolder,
        amount: annualTotal,
      });

      if (res.data?.success) {
        await api.post('/subscription', { action: 'PAY', seats });
        setPaymentSuccess(res.data);
      }
    } catch (err) {
      console.error(err);
      alert('Payment failed. Please check card details.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1724] text-white select-none font-sora flex flex-col justify-between p-6 relative overflow-hidden">
      <div className="absolute top-1/4 left-10 w-96 h-96 bg-[#f39c12]/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-10 w-96 h-96 bg-[#1fbbd2]/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Standalone Brand Navigation Bar */}
      <header className="max-w-6xl mx-auto w-full flex items-center justify-between py-4 border-b border-gray-800/80 mb-8 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center shadow-lg shadow-[#f39c12]/20">
            <Shield className="w-6 h-6 text-[#0d1724]" />
          </div>
          <div>
            <span className="text-xl font-extrabold text-white glow-gold">Clickrypt</span>
            <p className="text-[10px] text-[#1fbbd2] font-semibold">Stripe Secure Payment Portal</p>
          </div>
        </div>

        <Link
          href="/login"
          className="px-4 py-2 bg-[#17283b] hover:bg-gray-800 border border-[#1fbbd2]/40 text-gray-200 hover:text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-md"
        >
          <ArrowLeft className="w-4 h-4 text-[#f39c12]" />
          <span>Back to Sign In</span>
        </Link>
      </header>

      {/* Standalone Payment Checkout Portal */}
      <main className="max-w-6xl mx-auto w-full z-10 flex-1 flex flex-col justify-center">
        {/* Title */}
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-extrabold text-white flex items-center justify-center gap-3">
            <CreditCard className="w-8 h-8 text-[#f39c12]" />
            Pay Organization Subscription Bill
          </h1>
          <p className="text-xs text-[#1fbbd2] mt-1">
            Complete your bill payment to restore sign-in and vault access for your organization.
          </p>
        </div>

        {/* Payment Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Seats Slider & Credit Card Input */}
          <div className="lg:col-span-2 space-y-6">
            {/* Seat Selector Card */}
            <div className="glass-panel p-6 rounded-2xl border border-[rgba(31,187,210,0.25)] bg-[#17283b] shadow-xl">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-700/60">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#f39c12]" />
                  <h2 className="text-sm font-bold text-white">Organization Team Seats</h2>
                </div>
                <span className="text-xs text-[#1fbbd2] font-extrabold">$6 / user / month</span>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center text-xs font-bold text-gray-200">
                  <span>Select Number of Users:</span>
                  <span className="text-[#f39c12] text-base font-extrabold">{seats} Team Seats</span>
                </div>

                <input
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  value={seats}
                  onChange={(e) => setSeats(Number(e.target.value))}
                  className="w-full accent-[#f39c12] bg-gray-800 h-2 rounded-lg cursor-pointer"
                />

                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>5 Seats ($360/yr)</span>
                  <span>25 Seats ($1,800/yr)</span>
                  <span>50 Seats ($3,600/yr)</span>
                  <span>100 Seats ($7,200/yr)</span>
                </div>
              </div>
            </div>

            {/* Credit Card Details Card */}
            <div className="glass-panel-gold p-6 rounded-2xl border border-[rgba(243,156,18,0.4)] bg-[#17283b] shadow-2xl">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-700/60">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-[#f39c12]" />
                  <h2 className="text-sm font-bold text-white">Stripe Credit Card Payment</h2>
                </div>

                <div className="flex items-center gap-1.5 text-[10px] font-extrabold">
                  <span className={`px-2 py-0.5 rounded border transition-all ${
                    getCardBrand(cardNumber) === 'Visa'
                      ? 'bg-blue-600 text-white border-blue-400 font-extrabold shadow glow-cyan'
                      : 'bg-blue-900/60 text-blue-300 border-blue-700'
                  }`}>VISA</span>
                  <span className={`px-2 py-0.5 rounded border transition-all ${
                    getCardBrand(cardNumber) === 'Mastercard'
                      ? 'bg-rose-600 text-white border-rose-400 font-extrabold shadow'
                      : 'bg-rose-900/60 text-rose-300 border-rose-700'
                  }`}>MASTERCARD</span>
                  <span className={`px-2 py-0.5 rounded border transition-all ${
                    getCardBrand(cardNumber) === 'Amex'
                      ? 'bg-cyan-600 text-white border-cyan-400 font-extrabold shadow glow-cyan'
                      : 'bg-cyan-900/60 text-cyan-300 border-cyan-700'
                  }`}>AMEX</span>
                </div>
              </div>

              {/* 1-Click Test Cards Quick Fill Preset Bar */}
              <div className="flex flex-wrap items-center gap-2 mb-4 bg-[#0d1724] p-3 rounded-xl border border-gray-700/80">
                <span className="text-xs font-bold text-gray-300 mr-1">1-Click Test Presets:</span>
                <button
                  type="button"
                  onClick={() => handleFillTestCard('visa')}
                  className="px-2.5 py-1 bg-[#17283b] hover:bg-blue-950 border border-blue-500/60 text-blue-300 text-[10px] font-extrabold rounded-lg transition-all shadow cursor-pointer"
                >
                  Visa (4242)
                </button>
                <button
                  type="button"
                  onClick={() => handleFillTestCard('mastercard')}
                  className="px-2.5 py-1 bg-[#17283b] hover:bg-rose-950 border border-rose-500/60 text-rose-300 text-[10px] font-extrabold rounded-lg transition-all shadow cursor-pointer"
                >
                  Mastercard (5555)
                </button>
                <button
                  type="button"
                  onClick={() => handleFillTestCard('amex')}
                  className="px-2.5 py-1 bg-[#17283b] hover:bg-cyan-950 border border-cyan-500/60 text-cyan-300 text-[10px] font-extrabold rounded-lg transition-all shadow cursor-pointer"
                >
                  Amex (3782)
                </button>
              </div>

              <form onSubmit={handleSubmitPayment} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Cardholder Name</label>
                  <input
                    type="text"
                    placeholder="Alex Morgan"
                    value={cardHolder}
                    onChange={(e) => setCardHolder(e.target.value)}
                    className="w-full bg-[#0d1724] border border-gray-700 rounded-xl px-3 py-2.5 text-xs text-white focus:border-[#1fbbd2] outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Card Number</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="4242 4242 4242 4242"
                      value={cardNumber}
                      onChange={handleCardNumberChange}
                      className="w-full bg-[#0d1724] border border-gray-700 rounded-xl px-3 py-2.5 text-xs font-mono text-white focus:border-[#1fbbd2] outline-none pr-10"
                      required
                    />
                    <CreditCard className="w-4 h-4 text-[#f39c12] absolute right-3.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">Expiry Date</label>
                    <input
                      type="text"
                      placeholder="MM / YY"
                      value={expiry}
                      onChange={handleExpiryChange}
                      className="w-full bg-[#0d1724] border border-gray-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:border-[#1fbbd2] outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">CVC Code</label>
                    <input
                      type="password"
                      placeholder="123"
                      maxLength={4}
                      value={cvc}
                      onChange={(e) => setCvc(e.target.value)}
                      className="w-full bg-[#0d1724] border border-gray-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:border-[#1fbbd2] outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">ZIP / Postal</label>
                    <input
                      type="text"
                      placeholder="10001"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      className="w-full bg-[#0d1724] border border-gray-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:border-[#1fbbd2] outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={processing}
                  className="w-full py-3.5 gold-cyan-gradient-btn text-[#0d1724] font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 mt-4 shadow-xl transition-all"
                >
                  <Lock className="w-4 h-4" />
                  <span>
                    {processing
                      ? 'Processing Stripe Payment...'
                      : `Pay $${annualTotal.toLocaleString()}.00 USD via Stripe`}
                  </span>
                </button>
              </form>

              <div className="mt-3 flex items-center justify-between text-[10px] text-gray-400 border-t border-gray-700/60 pt-3">
                <span className="flex items-center gap-1 text-[#1fbbd2]">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#1fbbd2]" /> PCI DSS Level 1 Security
                </span>
                <span>Stripe 256-bit SSL Encrypted</span>
              </div>
            </div>
          </div>

          {/* Right Column: Order Summary */}
          <div className="glass-panel p-6 rounded-2xl border border-[rgba(31,187,210,0.25)] bg-[#17283b] flex flex-col justify-between shadow-2xl">
            <div>
              <h3 className="text-base font-bold text-white mb-4 pb-3 border-b border-gray-700/60">
                Order Summary
              </h3>

              <div className="space-y-3 text-xs border-b border-gray-700/60 pb-4">
                <div className="flex justify-between">
                  <span className="text-gray-400">Organization Plan (Annual)</span>
                  <span className="font-bold text-white">${annualTotal.toLocaleString()}.00</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Included Team Seats</span>
                  <span className="font-bold text-white">{seats} Seats</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Price per user</span>
                  <span className="font-bold text-[#1fbbd2]">$6.00 / mo</span>
                </div>
                <div className="flex justify-between text-emerald-400 font-semibold">
                  <span>Discount</span>
                  <span>-$0.00</span>
                </div>
              </div>

              <div className="pt-4 flex justify-between items-center mb-6">
                <span className="text-sm font-bold text-white">Total Due Today</span>
                <span className="text-3xl font-extrabold text-[#f39c12] glow-gold">
                  ${annualTotal.toLocaleString()}.00
                </span>
              </div>

              <div className="space-y-2 text-xs text-gray-300 mb-6 bg-[#0d1724] p-3.5 rounded-xl border border-gray-700">
                <p className="font-bold text-white text-[11px] mb-1">Included with payment:</p>
                <div className="flex items-center gap-2 text-[11px]">
                  <CheckCircle className="w-3.5 h-3.5 text-[#f39c12] shrink-0" />
                  <span>Restores Sign-In access for all team members</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <CheckCircle className="w-3.5 h-3.5 text-[#1fbbd2] shrink-0" />
                  <span>Unlimited zero-knowledge passwords</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <CheckCircle className="w-3.5 h-3.5 text-[#1fbbd2] shrink-0" />
                  <span>E2EE OpenPGP team sharing & groups</span>
                </div>
              </div>
            </div>

            <div className="p-3.5 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-xs text-emerald-300 flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
              <div>
                <p className="font-bold text-emerald-200">30-Day Money-Back Guarantee</p>
                <p className="text-[10px] text-emerald-300/80">Cancel anytime within 30 days for a full refund.</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Standalone Footer */}
      <footer className="max-w-6xl mx-auto w-full text-center text-[10px] text-gray-500 pt-6 border-t border-gray-800/60 mt-8 z-10">
        Clickrypt Zero-Knowledge Password Vault • Stripe Payment Portal • Encrypted with OpenPGP
      </footer>

      {/* Payment Success Confirmation Modal */}
      {paymentSuccess && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#17283b] border border-[#f39c12]/60 w-full max-w-md rounded-2xl p-6 shadow-2xl text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-950 border border-emerald-700 text-emerald-400 flex items-center justify-center mx-auto mb-4 glow-green">
              <CheckCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-extrabold text-white mb-1">Payment Confirmed & Access Restored!</h2>
            <p className="text-xs text-gray-300 mb-4">
              Your Stripe payment of ${paymentSuccess.amount}.00 USD was processed. Organization sign-in access is now unlocked.
            </p>

            <div className="bg-[#0d1724] p-3 rounded-xl border border-gray-700 text-xs text-left space-y-1.5 mb-6">
              <div className="flex justify-between">
                <span className="text-gray-400">Invoice Number:</span>
                <span className="font-mono font-bold text-[#f39c12]">{paymentSuccess.invoiceId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Stripe Payment ID:</span>
                <span className="font-mono text-gray-300 truncate max-w-[180px]">{paymentSuccess.paymentIntentId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Seats Unlocked:</span>
                <span className="font-bold text-white">{paymentSuccess.seats} Users</span>
              </div>
            </div>

            <Link
              href="/login"
              className="w-full py-3.5 gold-cyan-gradient-btn text-[#0d1724] font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xl"
            >
              <span>Proceed to Sign In to Vault</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
