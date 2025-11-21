import gsap from 'gsap'

// Language Management
let currentLang = null

// Content mode management
let isContentHidden = false

// Helper function to handle collapsed panel display (reduces code duplication)
function setupCollapsedPanel(collapseBtn) {
    const collapsedPanel = document.getElementById('collapsedPanel')
    collapsedPanel.innerHTML = ''
    createPanelButtons(collapsedPanel)
    collapsedPanel.appendChild(collapseBtn)
    collapsedPanel.style.display = 'flex'
    if (!collapsedPanel.classList.contains('visible')) {
        setTimeout(() => {
            collapsedPanel.classList.add('visible')
        }, 10)
    }
}

// Separate mode for each section
let sectionModes = {
    start: 'info',
    about: 'info',
    projects: 'info',
    contact: 'info'
}

// Get active mode for current section
function getActiveModeForSection(section) {
    return sectionModes[section] || 'info'
}

// Set active mode for current section
function setActiveModeForSection(section, mode) {
    sectionModes[section] = mode
}

// Auto-detect browser language on load
function detectLanguage() {
    const browserLang = navigator.language || navigator.userLanguage
    const savedLang = localStorage.getItem('preferredLanguage')

    if (savedLang) {
        currentLang = savedLang
    } else if (browserLang && browserLang.startsWith('en')) {
        currentLang = 'en'
    } else {
        currentLang = 'de'
    }

    updateLanguageDisplay()
    return currentLang
}

function toggleLanguage() {
    currentLang = currentLang === 'de' ? 'en' : 'de'
    localStorage.setItem('preferredLanguage', currentLang)
    updateLanguageDisplay()

    // Update tour orbit display if tour is active
    if (window.isTourActive && window.updateTourOrbitDisplay) {
        window.updateTourOrbitDisplay()
    }

    // Update controls language if controls are active
    if (window.controlsEnabled && window.updateControlsLanguage) {
        window.updateControlsLanguage()
    }

    // Refresh current view based on active mode for current section
    const currentNavSection = getCurrentNavSection()
    const activeMode = getActiveModeForSection(currentNavSection)

    if (activeMode === 'info') {
        // Info mode - normale Inhalte
        swapContent(currentNavSection)
    } else {
        // More oder Scene mode - spezielle Inhalte
        showModeContent(currentNavSection, activeMode)
    }

    // Update panel button labels if panel is visible
    const collapsedPanel = document.getElementById('collapsedPanel')
    if (collapsedPanel && collapsedPanel.classList.contains('visible')) {
        updatePanelButtonLabels()
    }
}

function updateLanguageDisplay() {
    const langDe = document.getElementById('lang-de')
    const langEn = document.getElementById('lang-en')

    if (langDe && langEn) {
        if (currentLang === 'de') {
            langDe.classList.add('active')
            langEn.classList.remove('active')
        } else {
            langDe.classList.remove('active')
            langEn.classList.add('active')
        }
    }

    // Update navbar links
    const navbarTranslations = {
        startButton: { de: 'Start', en: 'Start' },
        aboutButton: { de: 'Über', en: 'About' },
        projectsButton: { de: 'Projekte', en: 'Projects' },
        contactButton: { de: 'Kontakt', en: 'Contact' }
    }

    Object.keys(navbarTranslations).forEach(buttonId => {
        const button = document.getElementById(buttonId)
        if (button) {
            button.textContent = navbarTranslations[buttonId][currentLang]
        }
    })

    // Update footer links
    const footerImpressum = document.getElementById('footer-impressum')
    const footerDatenschutz = document.getElementById('footer-datenschutz')

    if (footerImpressum && footerDatenschutz) {
        if (currentLang === 'de') {
            footerImpressum.textContent = 'Impressum'
            footerDatenschutz.textContent = 'Datenschutz'
        } else {
            footerImpressum.textContent = 'Legal Notice'
            footerDatenschutz.textContent = 'Privacy Policy'
        }
    }

    // Update overlay content visibility
    updateOverlayLanguage()

    // Update breadcrumb language
    updateBreadcrumbLanguage()
}

function updateOverlayLanguage() {
    // Update impressum overlay
    const impressumDe = document.getElementById('impressum-de')
    const impressumEn = document.getElementById('impressum-en')
    if (impressumDe && impressumEn) {
        impressumDe.style.display = currentLang === 'de' ? 'block' : 'none'
        impressumEn.style.display = currentLang === 'en' ? 'block' : 'none'
    }

    // Update datenschutz overlay
    const datenschutzDe = document.getElementById('datenschutz-de')
    const datenschutzEn = document.getElementById('datenschutz-en')
    if (datenschutzDe && datenschutzEn) {
        datenschutzDe.style.display = currentLang === 'de' ? 'block' : 'none'
        datenschutzEn.style.display = currentLang === 'en' ? 'block' : 'none'
    }

    // Update menu overlay
    const menuDe = document.getElementById('menu-de')
    const menuEn = document.getElementById('menu-en')
    if (menuDe && menuEn) {
        menuDe.style.display = currentLang === 'de' ? 'block' : 'none'
        menuEn.style.display = currentLang === 'en' ? 'block' : 'none'
    }
}

function openOverlay(overlayId) {
    const overlay = document.getElementById(overlayId)
    if (overlay) {
        updateOverlayLanguage()

        // Set close hint text based on language
        const closeText = currentLang === 'de'
            ? overlay.getAttribute('data-close-text-de')
            : overlay.getAttribute('data-close-text-en')
        overlay.setAttribute('data-close-hint', closeText)

        overlay.style.display = 'block'
        document.body.style.overflow = 'hidden'
    }
}

function closeOverlay(overlayId) {
    const overlay = document.getElementById(overlayId)
    if (overlay) {
        overlay.style.display = 'none'
        document.body.style.overflow = 'auto'
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Ensure language is detected first
    if (!currentLang) {
        detectLanguage()
    }

    // Small delay to ensure DOM is fully ready
    setTimeout(() => {
        showStartContent()
        initBreadcrumbNavigation()
    }, 100)

    // Logo click handler - opens menu overlay
    const navLogo = document.getElementById('navLogo')
    if (navLogo) {
        navLogo.addEventListener('click', (e) => {
            e.preventDefault()
            openOverlay('menu-overlay')
        })
    }

    // Add language toggle event listeners
    const langDe = document.getElementById('lang-de')
    const langEn = document.getElementById('lang-en')

    if (langDe) {
        langDe.addEventListener('click', () => {
            if (currentLang !== 'de') toggleLanguage()
        })
    }

    if (langEn) {
        langEn.addEventListener('click', () => {
            if (currentLang !== 'en') toggleLanguage()
        })
    }

    // Add overlay event listeners
    const footerImpressum = document.getElementById('footer-impressum')
    const footerDatenschutz = document.getElementById('footer-datenschutz')

    if (footerImpressum) {
        footerImpressum.addEventListener('click', (e) => {
            e.preventDefault()
            openOverlay('impressum-overlay')
        })
    }

    if (footerDatenschutz) {
        footerDatenschutz.addEventListener('click', (e) => {
            e.preventDefault()
            openOverlay('datenschutz-overlay')
        })
    }

    // Add tour button event listeners
    const tourButtonDe = document.getElementById('start-tour-de')
    const tourButtonEn = document.getElementById('start-tour-en')

    if (tourButtonDe) {
        tourButtonDe.addEventListener('click', (e) => {
            e.preventDefault()
            closeOverlay('menu-overlay')
            setTimeout(() => {
                if (typeof window.startSceneTour === 'function') {
                    window.startSceneTour()
                }
            }, 300)
        })
    }

    if (tourButtonEn) {
        tourButtonEn.addEventListener('click', (e) => {
            e.preventDefault()
            closeOverlay('menu-overlay')
            setTimeout(() => {
                if (typeof window.startSceneTour === 'function') {
                    window.startSceneTour()
                }
            }, 300)
        })
    }

    // Add controls toggle button event listeners
    const toggleControlsDe = document.getElementById('toggle-controls-de')
    const toggleControlsEn = document.getElementById('toggle-controls-en')

    if (toggleControlsDe) {
        toggleControlsDe.addEventListener('click', (e) => {
            e.preventDefault()
            closeOverlay('menu-overlay')
            setTimeout(() => {
                if (typeof window.toggleOrbitControls === 'function') {
                    window.toggleOrbitControls()
                }
            }, 300)
        })
    }

    if (toggleControlsEn) {
        toggleControlsEn.addEventListener('click', (e) => {
            e.preventDefault()
            closeOverlay('menu-overlay')
            setTimeout(() => {
                if (typeof window.toggleOrbitControls === 'function') {
                    window.toggleOrbitControls()
                }
            }, 300)
        })
    }

    // Close overlay on any click
    const overlays = document.querySelectorAll('.overlay')
    overlays.forEach(overlay => {
        overlay.addEventListener('click', () => {
            closeOverlay(overlay.id)
        })
    })

    // Close overlay on ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            overlays.forEach(overlay => {
                if (overlay.style.display === 'block') {
                    closeOverlay(overlay.id)
                }
            })
        }
    })
})

function showStartContent() {
    if (!currentLang) {
        detectLanguage()
    }

    // Check active mode for start section
    const activeMode = getActiveModeForSection('start')

    // If mode is not 'info', show mode content instead
    if (activeMode !== 'info') {
        // WICHTIG: Breadcrumb ZUERST aktualisieren, bevor Panel-Buttons erstellt werden
        updateBreadcrumb('start')
        showModeContent('start', activeMode)
        // showModeContent() kümmert sich bereits um das Panel
        return
    }

    const main = document.getElementById('startContent')
    const startDiv = document.getElementById(`start-${currentLang}`)

    if (startDiv) {
        const clone = startDiv.cloneNode(true)
        clone.style.display = 'block' // Show the cloned content
        clone.classList.remove('lang-de', 'lang-en') // Remove language classes
        // Keep the ID for language switching
        clone.id = `start-${currentLang}`
        main.innerHTML = ''

        // Add collapse button
        const collapseBtn = document.createElement('button')
        collapseBtn.id = 'collapseContent'
        collapseBtn.className = 'collapse-btn'
        collapseBtn.addEventListener('click', toggleContentVisibility)

        // Maintain collapsed state if it was hidden
        if (isContentHidden) {
            main.classList.add('content-collapsed')
            collapseBtn.innerHTML = '<span class="collapse-icon">▲</span>'
            collapseBtn.setAttribute('aria-label', 'Show content')
            setupCollapsedPanel(collapseBtn)
        } else {
            collapseBtn.innerHTML = '<span class="collapse-icon">▼</span>'
            collapseBtn.setAttribute('aria-label', 'Hide content')
            main.appendChild(collapseBtn)
        }

        main.appendChild(clone)
        updateBreadcrumb('start')
    } else {
        console.error(`Could not find start content for language: ${currentLang}`)
        main.innerHTML = `<p style="color: #ff6666; text-align: center; padding: 2rem;">Content not available for this language.</p>`
    }
}

function swapContent(id) {
    // Check active mode for this section
    const activeMode = getActiveModeForSection(id)

    // If mode is not 'info', show mode content instead
    if (activeMode !== 'info') {
        // WICHTIG: Breadcrumb ZUERST aktualisieren, bevor Panel-Buttons erstellt werden
        updateBreadcrumb(id)
        showModeContent(id, activeMode)
        // showModeContent() kümmert sich bereits um das Panel
        return
    }

    const main = document.getElementById('startContent')
    const div = document.getElementById(`${id}-${currentLang}`)

    if (div) {
        const clone = div.cloneNode(true)
        clone.style.display = 'block' // Show the cloned content
        clone.classList.remove('lang-de', 'lang-en') // Remove language classes
        // Keep the ID for language switching
        clone.id = `${id}-${currentLang}`
        main.innerHTML = ''

        // Add collapse button
        const collapseBtn = document.createElement('button')
        collapseBtn.id = 'collapseContent'
        collapseBtn.className = 'collapse-btn'
        collapseBtn.addEventListener('click', toggleContentVisibility)

        // Maintain collapsed state if it was hidden
        if (isContentHidden) {
            main.classList.add('content-collapsed')
            collapseBtn.innerHTML = '<span class="collapse-icon">▲</span>'
            collapseBtn.setAttribute('aria-label', 'Show content')
            setupCollapsedPanel(collapseBtn)
        } else {
            collapseBtn.innerHTML = '<span class="collapse-icon">▼</span>'
            collapseBtn.setAttribute('aria-label', 'Hide content')
            main.appendChild(collapseBtn)
        }

        main.appendChild(clone)
        updateBreadcrumb(id)
    } else {
        console.error(`Could not find content for: ${id}-${currentLang}`)
        main.innerHTML = `<p style="color: #ff6666; text-align: center; padding: 2rem;">Content not available.</p>`
    }
}

// Breadcrumb Management
function updateBreadcrumb(activeSection) {
    const breadcrumbItems = document.querySelectorAll('.breadcrumb-item')
    breadcrumbItems.forEach(item => {
        const navTarget = item.getAttribute('data-nav')
        // Remove loading state from all items
        item.classList.remove('loading')

        if (navTarget === activeSection) {
            item.classList.add('active')
        } else {
            item.classList.remove('active')
        }
    })

    // Update space cam number
    updateSpaceCam(activeSection)
}

function updateSpaceCam(activeSection) {
    // Don't update CAM display during tour or when controls are active
    if (window.isTourActive) return
    if (window.controlsEnabled) return

    const camMapping = {
        start: '1',
        about: '2',
        projects: '3',
        contact: '4'
    }

    const camNumberElement = document.querySelector('.cam-number')
    const camLabelElement = document.querySelector('.cam-label')

    if (!camNumberElement || !camLabelElement) {
        console.warn('CAM display elements not found')
        return
    }

    if (camMapping[activeSection]) {
        camNumberElement.textContent = camMapping[activeSection]
    }

    // Make sure CAM label is visible (might be hidden from tour)
    camLabelElement.style.display = 'block'
}

function updateBreadcrumbLanguage() {
    const breadcrumbTranslations = {
        start: { de: 'Start', en: 'Start' },
        about: { de: 'Über', en: 'About' },
        projects: { de: 'Projekte', en: 'Projects' },
        contact: { de: 'Kontakt', en: 'Contact' }
    }

    const breadcrumbItems = document.querySelectorAll('.breadcrumb-item')
    breadcrumbItems.forEach(item => {
        const navTarget = item.getAttribute('data-nav')
        const buttonInner = item.querySelector('.button-inner')
        if (breadcrumbTranslations[navTarget] && buttonInner) {
            buttonInner.textContent = breadcrumbTranslations[navTarget][currentLang]
        }
    })
}

function initBreadcrumbNavigation() {
    const breadcrumbItems = document.querySelectorAll('.breadcrumb-item')
    const navigationMap = {
        start: 'getStart',
        about: 'getHome',
        projects: 'getMoon',
        contact: 'getMars'
    }

    breadcrumbItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault()

            // Wenn Button bereits active ist, nichts tun
            if (item.classList.contains('active')) {
                return
            }

            const navTarget = item.getAttribute('data-nav')
            const functionName = navigationMap[navTarget]

            // Remove active and loading state from all items, then add loading to clicked item
            breadcrumbItems.forEach(btn => {
                btn.classList.remove('loading')
                btn.classList.remove('active')
            })
            item.classList.add('loading')

            // Fallback to remove loading state after 2 seconds if not removed by navigation
            const loadingTimeout = setTimeout(() => {
                item.classList.remove('loading')
            }, 2000)

            if (functionName && typeof window[functionName] === 'function') {
                try {
                    window[functionName]()
                    // updateBreadcrumb() will be called by the navigation function and remove loading state
                    // If it's called quickly, this timeout will be harmless
                } catch (error) {
                    console.error('Navigation error:', error)
                    clearTimeout(loadingTimeout)
                    item.classList.remove('loading')
                }
            } else {
                clearTimeout(loadingTimeout)
                item.classList.remove('loading')
            }
        })
    })
}

// Content collapse/expand functionality
// Helper function to create panel buttons with labels
function createPanelButtons(collapsedPanel) {
    const buttonLabels = {
        de: ['Info', 'Mehr', 'Szene'],
        en: ['Info', 'More', 'Scene']
    }

    const labels = buttonLabels[currentLang] || buttonLabels.de
    const modes = ['info', 'more', 'scene']
    const currentSection = getCurrentNavSection()
    const currentMode = getActiveModeForSection(currentSection)

    for (let i = 0; i < 3; i++) {
        const btn = document.createElement('button')
        btn.className = 'panel-button'
        btn.id = `panelBtn${i + 1}`
        btn.setAttribute('data-index', i)
        btn.setAttribute('data-mode', modes[i])
        btn.innerHTML = `<span class="button-label">${labels[i]}</span>`

        // Active state für aktuellen Mode der aktuellen Section
        if (modes[i] === currentMode) {
            btn.classList.add('active')
        }

        // Click handler für Mode-Wechsel
        btn.addEventListener('click', () => {
            const section = getCurrentNavSection()
            const selectedMode = modes[i]

            // Modus für aktuelle Sektion speichern
            setActiveModeForSection(section, selectedMode)

            // Alle panel buttons updaten
            collapsedPanel.querySelectorAll('.panel-button').forEach(b => {
                b.classList.remove('active')
            })
            btn.classList.add('active')

            // Content sofort einblenden und passenden Text anzeigen
            if (isContentHidden) {
                // Content einblenden
                isContentHidden = false
                const startContent = document.getElementById('startContent')
                startContent.classList.remove('content-collapsed')

                // Panel ausblenden
                collapsedPanel.classList.remove('visible')
                setTimeout(() => {
                    collapsedPanel.innerHTML = ''
                    collapsedPanel.style.display = 'none'
                }, 400)

                // Content basierend auf Modus anzeigen
                if (selectedMode === 'info') {
                    swapContent(section)
                } else {
                    showModeContent(section, selectedMode)
                }
            }
        })

        collapsedPanel.appendChild(btn)
    }
}

// Update panel button labels when language changes
function updatePanelButtonLabels() {
    const buttonLabels = {
        de: ['Info', 'Mehr', 'Szene'],
        en: ['Info', 'More', 'Scene']
    }

    const labels = buttonLabels[currentLang] || buttonLabels.de

    for (let i = 0; i < 3; i++) {
        const btn = document.getElementById(`panelBtn${i + 1}`)
        if (btn) {
            const labelSpan = btn.querySelector('.button-label')
            if (labelSpan) {
                labelSpan.textContent = labels[i]
            }
        }
    }
}

function toggleContentVisibility() {
    isContentHidden = !isContentHidden
    const startContent = document.getElementById('startContent')
    const collapseBtn = document.getElementById('collapseContent')
    const collapseIcon = collapseBtn.querySelector('.collapse-icon')
    const collapsedPanel = document.getElementById('collapsedPanel')

    if (isContentHidden) {
        startContent.classList.add('content-collapsed')
        collapseIcon.textContent = '▲'
        collapseBtn.setAttribute('aria-label', 'Show content')

        // Button ins Collapsed Panel bewegen
        collapsedPanel.innerHTML = ''

        // 3 echte Buttons mit Labels hinzufügen
        createPanelButtons(collapsedPanel)

        // Collapse-Button hinzufügen
        collapsedPanel.appendChild(collapseBtn)
        collapsedPanel.style.display = 'flex'
        // Kurze Verzögerung für smooth Animation
        setTimeout(() => {
            collapsedPanel.classList.add('visible')
        }, 10)
    } else {
        startContent.classList.remove('content-collapsed')

        // Panel ausblenden
        collapsedPanel.classList.remove('visible')
        setTimeout(() => {
            collapsedPanel.innerHTML = ''
            collapsedPanel.style.display = 'none'
        }, 400) // Nach Animation

        // Content basierend auf aktivem Panel-Mode anzeigen
        updateContentByMode()
    }
}

// Update content based on active panel mode for current section
function updateContentByMode() {
    const main = document.getElementById('startContent')
    const currentNavSection = getCurrentNavSection()
    const activeMode = getActiveModeForSection(currentNavSection)

    if (activeMode === 'info') {
        // Normal content anzeigen
        swapContent(currentNavSection)
    } else if (activeMode === 'more') {
        // More content anzeigen (Platzhalter)
        showModeContent(currentNavSection, 'more')
    } else if (activeMode === 'scene') {
        // Scene content anzeigen (Platzhalter)
        showModeContent(currentNavSection, 'scene')
    }
}

// Get current navigation section
function getCurrentNavSection() {
    const activeItem = document.querySelector('.breadcrumb-item.active')
    if (activeItem) {
        return activeItem.getAttribute('data-nav')
    }
    return 'start'
}

// Show content for specific mode
function showModeContent(section, mode) {
    const main = document.getElementById('startContent')
    main.innerHTML = ''

    const collapseBtn = document.createElement('button')
    collapseBtn.id = 'collapseContent'
    collapseBtn.className = 'collapse-btn'
    collapseBtn.addEventListener('click', toggleContentVisibility)

    const content = document.createElement('div')
    content.className = 'content'
    content.style.display = 'block'

    // Platzhalter content - 12 verschiedene Kombinationen (4 Sektionen × 3 Modi)
    const contentData = {
        start: {
            more: {
                de: { title: 'Start - Mehr', text: 'Zusätzliche Informationen über mich und meine Arbeit.' },
                en: { title: 'Start - More', text: 'Additional information about me and my work.' }
            },
            scene: {
                de: { title: 'Start - Szene', text: 'Details zur Start-Szene und Visualisierung.' },
                en: { title: 'Start - Scene', text: 'Details about the start scene and visualization.' }
            }
        },
        about: {
            more: {
                de: { title: 'Über - Mehr', text: 'Erweiterte Details über meine Fähigkeiten und Erfahrungen.' },
                en: { title: 'About - More', text: 'Extended details about my skills and experience.' }
            },
            scene: {
                de: { title: 'Über - Szene', text: 'Details zur Über-Szene und Kamera-Perspektive.' },
                en: { title: 'About - Scene', text: 'Details about the about scene and camera perspective.' }
            }
        },
        projects: {
            more: {
                de: { title: 'Projekte - Mehr', text: 'Zusätzliche Details und Hintergründe zu meinen Projekten.' },
                en: { title: 'Projects - More', text: 'Additional details and background about my projects.' }
            },
            scene: {
                de: { title: 'Projekte - Szene', text: 'Details zur Projekte-Szene und visuellen Effekten.' },
                en: { title: 'Projects - Scene', text: 'Details about the projects scene and visual effects.' }
            }
        },
        contact: {
            more: {
                de: { title: 'Kontakt - Mehr', text: 'Weitere Kontaktmöglichkeiten und Informationen.' },
                en: { title: 'Contact - More', text: 'Additional contact options and information.' }
            },
            scene: {
                de: { title: 'Kontakt - Szene', text: 'Details zur Kontakt-Szene und Ambiente.' },
                en: { title: 'Contact - Scene', text: 'Details about the contact scene and ambience.' }
            }
        }
    }

    const data = contentData[section]?.[mode]?.[currentLang] || contentData.start.more.de
    content.innerHTML = `
        <p><strong>${data.title}</strong></p>
        <p>${data.text}</p>
        <p style="opacity: 0.6; font-size: 0.9em;">Platzhalter für ${section} / ${mode}</p>
    `

    // Maintain collapsed state if it was hidden
    if (isContentHidden) {
        main.classList.add('content-collapsed')
        collapseBtn.innerHTML = '<span class="collapse-icon">▲</span>'
        collapseBtn.setAttribute('aria-label', 'Show content')
        // Button ins Panel mit echten Buttons
        const collapsedPanel = document.getElementById('collapsedPanel')
        collapsedPanel.innerHTML = ''
        // 3 echte Buttons mit Labels hinzufügen
        createPanelButtons(collapsedPanel)
        collapsedPanel.appendChild(collapseBtn)
        // Panel immer sichtbar machen wenn Content ausgeblendet
        collapsedPanel.style.display = 'flex'
        if (!collapsedPanel.classList.contains('visible')) {
            setTimeout(() => {
                collapsedPanel.classList.add('visible')
            }, 10)
        }
    } else {
        collapseBtn.innerHTML = '<span class="collapse-icon">▼</span>'
        collapseBtn.setAttribute('aria-label', 'Hide content')
        main.appendChild(collapseBtn)
    }

    main.appendChild(content)
}

// Removed unused functions: updateBreadcrumbToCam, restoreBreadcrumbLabels
// (no longer needed as breadcrumb labels remain constant)

// Export functions to global scope for scene.js (Vite compatibility)
window.swapContent = swapContent
window.getCurrentNavSection = getCurrentNavSection
window.updateSpaceCam = updateSpaceCam
window.updateBreadcrumb = updateBreadcrumb
window.showStartContent = showStartContent
