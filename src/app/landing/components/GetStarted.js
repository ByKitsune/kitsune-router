"use client";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { NPM_PACKAGE_NAME } from "@/shared/constants/config.js";

// Built from the real package name. The bare-name literal this replaced
// named an UNCLAIMED package, so anyone copying the command from the landing page
// got an npm 404.
const RUN_CMD = `npx ${NPM_PACKAGE_NAME}`;

export default function GetStarted() {
  const { copied, copy } = useCopyToClipboard();

  const handleCopy = (text) => {
    copy(text, "landing");
  };

  return (
    <section className="py-24 px-6 bg-[#0c1017]">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row gap-16 items-start">
          {/* Left: Steps */}
          <div className="flex-1">
            <h2 className="text-3xl md:text-4xl font-bold mb-6 text-white">Get Started in 30 Seconds</h2>
            <p className="text-gray-400 text-lg mb-8">
              Launch ZenRouter, configure your providers via the serene web dashboard, and supercharge your local AI coding workflows.
            </p>
            
            <div className="flex flex-col gap-6">
              <div className="flex gap-4">
                <div className="flex-none w-8 h-8 rounded-full bg-[#4B72A4]/25 text-[#7b9fc8] border border-[#4B72A4]/40 flex items-center justify-center font-bold">1</div>
                <div>
                  <h4 className="font-bold text-lg text-white">Start ZenRouter</h4>
                  <p className="text-sm text-gray-400 mt-1">Run npx command to launch the local gateway</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex-none w-8 h-8 rounded-full bg-[#4B72A4]/25 text-[#7b9fc8] border border-[#4B72A4]/40 flex items-center justify-center font-bold">2</div>
                <div>
                  <h4 className="font-bold text-lg text-white">Connect Accounts</h4>
                  <p className="text-sm text-gray-400 mt-1">Authenticate Claude, Gemini, OpenAI, or Kiro in one click</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex-none w-8 h-8 rounded-full bg-[#E85D3F]/25 text-[#F06A4E] border border-[#E85D3F]/40 flex items-center justify-center font-bold">3</div>
                <div>
                  <h4 className="font-bold text-lg text-white">Stream &amp; Code</h4>
                  <p className="text-sm text-gray-400 mt-1">Point Claude Code or Cursor to http://localhost:20128/v1</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Code block */}
          <div className="flex-1 w-full">
            <div className="rounded-xl overflow-hidden bg-[#141b24] border border-[#233044] shadow-2xl">
              {/* Terminal header */}
              <div className="flex items-center gap-2 px-4 py-3 bg-[#192230] border-b border-[#233044]">
                <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                <div className="ml-2 text-xs text-gray-400 font-mono">terminal</div>
              </div>
              
              {/* Terminal content */}
              <div className="p-6 font-mono text-sm leading-relaxed overflow-x-auto">
                <div 
                  className="flex items-center gap-2 mb-4 group cursor-pointer"
                  onClick={() => handleCopy(RUN_CMD)}
                >
                  <span className="text-emerald-400">$</span>
                  <span className="text-white font-medium">{RUN_CMD}</span>
                  <span className="ml-auto text-gray-400 text-xs opacity-0 group-hover:opacity-100">
                    {copied === "landing" ? "✓ Copied" : "Copy"}
                  </span>
                </div>
                
                <div className="text-gray-300 mb-6">
                  <span className="text-[#5D87B8]">&gt;</span> Starting ZenRouter Engine...<br/>
                  <span className="text-[#5D87B8]">&gt;</span> Server active on <span className="text-blue-400">http://localhost:20128</span><br/>
                  <span className="text-[#5D87B8]">&gt;</span> Dashboard: <span className="text-blue-400">http://localhost:20128/dashboard</span><br/>
                  <span className="text-emerald-400">&gt;</span> Gateway ready to route! ✓
                </div>
                
                <div className="text-xs text-gray-400 mb-2 border-t border-[#233044] pt-4">
                  🌿 Clean state machine RTK token-killer active (-40% redundant tokens)
                </div>
                
                <div className="text-gray-400 text-xs">
                  <span className="text-[#b0c6df]">Database Storage:</span><br/>
                  <span className="text-gray-500">  macOS/Linux:</span> ~/.zenrouter/db/data.sqlite (or ~/.zenrouter)<br/>
                  <span className="text-gray-500">  Windows:</span> %APPDATA%/zenrouter/db/data.sqlite
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

