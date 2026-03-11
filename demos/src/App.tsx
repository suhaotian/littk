import React, { useState, useEffect } from "react";
import "./index.css";
import { littkk } from "littkk";

export function App() {
  return <LittkDemo />;
}

const LittkDemo = () => {
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  // Basic Headroom Logic simulation
  useEffect(() => {
    const ctrl = littkk();
    return () => ctrl.destroy();
  }, []);

  // Haptic-like sound feedback for UI actions
  const playClick = () => {
    const audio = new Audio(
      "https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3"
    );
    audio.volume = 0.2;
    audio.play();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100">
      {/* HEADER: Selector .littk-top */}

      <div
        className="sticky top-0 flex items-center justify-between px-6 py-4 z-2 bg-white"
        data-scroll-top>
        <h1 className="text-xl font-black tracking-tight text-indigo-600">
          littkk.js
        </h1>
        <button
          onClick={playClick}
          className="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <div className="w-6 h-6 bg-slate-800 rounded-sm" />
        </button>
      </div>

      {/* TABS: Sticky below header */}
      <nav
        className="sticky top-[72px] z-3 bg-white flex px-4 overflow-x-auto no-scrollbar border-t border-slate-100"
        data-scroll-top={0}>
        {["Explore", "Trending", "Saved", "Settings"].map((tab, i) => (
          <button
            key={tab}
            onClick={playClick}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all
              ${
                i === 0
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500"
              }`}>
            {tab}
          </button>
        ))}
      </nav>

      {/* CONTENT AREA */}
      <main className="pt-32 pb-32 px-6 max-w-2xl mx-auto">
        <section className="space-y-8">
          <div className="p-8 bg-indigo-600 rounded-3xl text-white shadow-xl shadow-indigo-200">
            <h2 className="text-3xl font-bold mb-2">Multi-Selector Test</h2>
            <p className="opacity-90">
              Scroll down to see the header and bottom bar react independently.
            </p>
          </div>

          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="group p-6 bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 transition-all hover:shadow-md">
              <div className="h-40 bg-slate-100 rounded-xl mb-4 overflow-hidden">
                <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 group-hover:scale-105 transition-transform duration-500" />
              </div>
              <div className="h-4 w-2/3 bg-slate-200 rounded-full mb-2" />
              <div className="h-4 w-1/2 bg-slate-100 rounded-full" />
            </div>
          ))}
        </section>
      </main>

      {/* FLOATING ACTION BUTTON (FAB) */}
      <button
        onClick={playClick}
        className={`fixed right-6 bottom-24 z-40 w-14 h-14 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-300 
        flex items-center justify-center text-2xl transition-all active:scale-90 hover:bg-indigo-700`}
        data-scroll-bottom="0"
        data-scroll-right="0"
        data-delay="100">
        ＋
      </button>

      {/* BOTTOM BAR: Selector .littk-bottom */}
      <footer
        className={`fixed bottom-0 w-full z-50 transition-transform duration-300 ease-in-out bg-white border-t border-slate-200 pb-safe`}
        data-scroll-bottom>
        <div className="flex justify-around items-center h-16">
          {["Home", "Search", "Profile"].map((item) => (
            <button
              key={item}
              onClick={playClick}
              className="flex flex-col items-center justify-center w-full h-full text-slate-400 hover:text-indigo-600 transition-colors">
              <div className="w-5 h-5 bg-current rounded-full mb-1" />
              <span className="text-[10px] uppercase tracking-widest font-bold">
                {item}
              </span>
            </button>
          ))}
        </div>
      </footer>
    </div>
  );
};
