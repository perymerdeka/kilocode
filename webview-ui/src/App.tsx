import { useCallback, useEffect, useRef, useState } from "react"
import { useEvent } from "react-use"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { ExtensionMessage } from "@roo/ExtensionMessage"

import TranslationProvider from "./i18n/TranslationContext"
import { vscode } from "./utils/vscode"
import { ExtensionStateContextProvider, useExtensionState } from "./context/ExtensionStateContext"
import ChatView, { ChatViewRef } from "./components/chat/ChatView"
import HistoryView from "./components/history/HistoryView"
import SettingsView, { SettingsViewRef } from "./components/settings/SettingsView"
import WelcomeView from "./components/kilocode/Welcome/WelcomeView" // kilocode_change
import ProfileView from "./components/kilocode/profile/ProfileView" // kilocode_change
import ModesView from "./components/modes/ModesView"
import { HumanRelayDialog } from "./components/human-relay/HumanRelayDialog"
import BottomControls from "./components/chat/BottomControls" // kilocode_change
import { AccountView } from "./components/account/AccountView"

type Tab = "settings" | "history" | "mcp" | "modes" | "chat" | "account" | "profile" // kilocode_change: add "profile"

const tabsByMessageAction: Partial<Record<NonNullable<ExtensionMessage["action"]>, Tab>> = {
	chatButtonClicked: "chat",
	settingsButtonClicked: "settings",
	promptsButtonClicked: "modes",
	historyButtonClicked: "history",
	profileButtonClicked: "profile",
	accountButtonClicked: "account",
}

const App = () => {
	const { didHydrateState, showWelcome, shouldShowAnnouncement, cloudUserInfo } = useExtensionState()

	const [showAnnouncement, setShowAnnouncement] = useState(false)
	const [tab, setTab] = useState<Tab>("chat")

	const [humanRelayDialogState, setHumanRelayDialogState] = useState<{
		isOpen: boolean
		requestId: string
		promptText: string
	}>({
		isOpen: false,
		requestId: "",
		promptText: "",
	})

	const settingsRef = useRef<SettingsViewRef>(null)
	const chatViewRef = useRef<ChatViewRef & { focusInput: () => void }>(null) // kilocode_change

	const switchTab = useCallback((newTab: Tab) => {
		setCurrentSection(undefined)

		if (settingsRef.current?.checkUnsaveChanges) {
			settingsRef.current.checkUnsaveChanges(() => setTab(newTab))
		} else {
			setTab(newTab)
		}
	}, [])

	const [currentSection, setCurrentSection] = useState<string | undefined>(undefined)

	const onMessage = useCallback(
		(e: MessageEvent) => {
			const message: ExtensionMessage = e.data

			if (message.type === "action" && message.action) {
				// kilocode_change begin
				if (message.action === "focusChatInput") {
					if (tab !== "chat") {
						switchTab("chat")
					}
					chatViewRef.current?.focusInput()
					return
				}
				// kilocode_change end

				const newTab = tabsByMessageAction[message.action]
				const section = message.values?.section as string | undefined

				if (newTab) {
					switchTab(newTab)
					setCurrentSection(section)
				}
			}

			if (message.type === "showHumanRelayDialog" && message.requestId && message.promptText) {
				const { requestId, promptText } = message
				setHumanRelayDialogState({ isOpen: true, requestId, promptText })
			}

			if (message.type === "acceptInput") {
				chatViewRef.current?.acceptInput()
			}
		},
		// kilocode_change: add tab
		[tab, switchTab],
	)

	useEvent("message", onMessage)

	useEffect(() => {
		if (shouldShowAnnouncement) {
			setShowAnnouncement(true)
			vscode.postMessage({ type: "didShowAnnouncement" })
		}
	}, [shouldShowAnnouncement])

	// Tell the extension that we are ready to receive messages.
	useEffect(() => vscode.postMessage({ type: "webviewDidLaunch" }), [])

	if (!didHydrateState) {
		return null
	}

	// Do not conditionally load ChatView, it's expensive and there's state we
	// don't want to lose (user input, disableInput, askResponse promise, etc.)
	return showWelcome ? (
		<WelcomeView />
	) : (
		<>
			{tab === "modes" && <ModesView onDone={() => switchTab("chat")} />}
			{tab === "history" && <HistoryView onDone={() => switchTab("chat")} />}
			{tab === "settings" && (
				<SettingsView ref={settingsRef} onDone={() => switchTab("chat")} targetSection={currentSection} /> // kilocode_change
			)}
			{tab === "profile" && <ProfileView onDone={() => switchTab("chat")} />}
			{tab === "account" && <AccountView userInfo={cloudUserInfo} onDone={() => switchTab("chat")} />}
			<ChatView
				ref={chatViewRef}
				isHidden={tab !== "chat"}
				showAnnouncement={showAnnouncement}
				hideAnnouncement={() => setShowAnnouncement(false)}
			/>
			<HumanRelayDialog
				isOpen={humanRelayDialogState.isOpen}
				requestId={humanRelayDialogState.requestId}
				promptText={humanRelayDialogState.promptText}
				onClose={() => setHumanRelayDialogState((prev) => ({ ...prev, isOpen: false }))}
				onSubmit={(requestId, text) => vscode.postMessage({ type: "humanRelayResponse", requestId, text })}
				onCancel={(requestId) => vscode.postMessage({ type: "humanRelayCancel", requestId })}
			/>
			{/* kilocode_change */}
			{/* Chat, prompts and history view contain their own bottom controls */}
			{!["chat", "prompts", "history"].includes(tab) && (
				<div className="fixed inset-0 top-auto">
					<BottomControls />
				</div>
			)}
		</>
	)
}

const queryClient = new QueryClient()

const AppWithProviders = () => (
	<ExtensionStateContextProvider>
		<TranslationProvider>
			<QueryClientProvider client={queryClient}>
				<App />
			</QueryClientProvider>
		</TranslationProvider>
	</ExtensionStateContextProvider>
)

export default AppWithProviders
