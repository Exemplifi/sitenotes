// Scroll Animations for SVG Elements
// Handles stroke animations, fade-ins, and slide animations based on scroll position

class ScrollAnimations {
    constructor() {
        this.animations = new Map();
        this.observer = null;
        // Cross-section gating and skeleton flags
        this.sectionOneGateOpen = false;
        this.sectionOneGateTimer = null;
        this.skeletonBaseTriggeredOne = false;
        this.skeletonBaseTriggeredTwo = false;
        this.sectionTwoGateOpen = false;
        this.sectionTwoGateTimer = null;
        // Section-one completion tracking
        this.sectionOneLineCompleted = false;
        this.sectionOnePopupCompleted = false;
        this.sectionOneSkeletonCompleted = false;
        this.sectionOneLineCompletionTimer = null;
        this.sectionOnePopupCompletionTimer = null;
        this.sectionOneSkeletonCompletionTimer = null;
        // Section-three popup stagger timer
        this.popupFourDelayTimer = null;
        // Section-two completion tracking (for gating section three)
        this.sectionTwoLineCompleted = false;
        this.sectionTwoPopupCompleted = false;
        this.sectionTwoSkeletonCompleted = false;
        this.sectionTwoLineCompletionTimer = null;
        this.sectionTwoPopupCompletionTimer = null;
        this.sectionTwoSkeletonCompletionTimer = null;
        // Section icons opacity control
        this.sectionOneIconsAnimation = null;
        this.sectionTwoIconsAnimation = null;
        this.sectionThreeIconsAnimation = null;
        // Remove HUD (no on-screen scroll percent)
        this.scrollHUD = null;
        this.scrollHUDSpans = { one: null, two: null, three: null };
        // Per-virtual-segment start offsets (0..100) within content-container pages
        this.sectionStartOffset = { one: 0, two: 0, three: 0 };
        // Threshold hysteresis and debounce to avoid flicker/stuck states
        this.thresholdMargin = 2; // percent
        this.debounceDelayMs = 60; // ms
        this.debounceTimers = {};
        this.init();
    }

    // Pick the correct mobile scroll element dynamically
    getMobileScrollEl() {
        const svgContainer = document.querySelector('.svg-container');
        const svgColumn = document.querySelector('.svg-column');
        const isScrollable = (el) => {
            if (!el) return false;
            const style = getComputedStyle(el);
            const overflowY = style.overflowY || '';
            return (el.scrollHeight - el.clientHeight > 1) && /auto|scroll/i.test(overflowY);
        };
        if (isScrollable(svgContainer)) return svgContainer;
        if (isScrollable(svgColumn)) return svgColumn;
        return document.querySelector('.content-container');
    }

    // Force trigger base animations (line at 25%, skeleton/popup at 50%) for a section
    forceTriggerBaseAnimations(section) {
        const lineKey = `lineAnimation${section}`;
        if (this[lineKey] && !this[lineKey].triggered) {
            // Ensure line is visible at base state
            this[lineKey].elements.forEach(element => {
                element.style.transition = 'stroke-dashoffset 0.01s linear, opacity 0.01s linear';
                element.style.strokeDashoffset = '0';
                element.style.opacity = '1';
            });
            this[lineKey].triggered = true;
            this[lineKey].reverseTriggered = false;
        }

        // Popup (one|two)
        const popupKey = `popup${section === 'one' ? 'One' : section === 'two' ? 'Two' : ''}Animation`;
        if (popupKey && this[popupKey] && !this[popupKey].triggered) {
            this[popupKey].element.style.transition = 'opacity 0.01s linear, transform 0.01s linear';
            this[popupKey].element.style.opacity = '1';
            this[popupKey].element.style.transform = 'translate(0,0)';
            this[popupKey].triggered = true;
            this[popupKey].reverseTriggered = false;
        }

        // Skeleton per section
        const skeletonKey = `skeletonAnimation${section}`;
        if (this[skeletonKey] && !this[skeletonKey].triggered) {
            this[skeletonKey].element.style.transition = 'opacity 0.01s linear';
            this[skeletonKey].element.style.opacity = '1';
            this[skeletonKey].triggered = true;
            this[skeletonKey].reverseTriggered = false;
        }

        // Mark gates if base states are satisfied
        if (section === 'one') {
            this.skeletonBaseTriggeredOne = true;
        } else if (section === 'two') {
            this.skeletonBaseTriggeredTwo = true;
        }
    }

    // Apply a section's visual state as if it had scrolled to a given percent (0-100)
    applySectionState(section, percent) {
        const clamped = Math.max(0, Math.min(100, percent));
        const lineKey = `lineAnimation${section}`;
        const skeletonKey = `skeletonAnimation${section}`;
        const popupKey = section === 'one' ? 'popupOneAnimation' : section === 'two' ? 'popupTwoAnimation' : null;

        // Line: 0-24% hidden, 25-79% visible at 0, 80-100% at positive/negative based on section rules
        if (this[lineKey]) {
            this[lineKey].elements.forEach(element => {
                const length = element.getTotalLength();
                element.style.transition = 'none';
                if (clamped < 25) {
                    element.style.strokeDashoffset = (section === 'two' || section === 'three') ? -length : length;
                    element.style.opacity = '0';
                } else if (clamped < 80) {
                    element.style.strokeDashoffset = '0';
                    element.style.opacity = '1';
                } else {
                    element.style.strokeDashoffset = (section === 'one') ? `-${length}` : `${length}`;
                    element.style.opacity = '1';
                }
            });
            this[lineKey].triggered = clamped >= 25;
            this[lineKey].reverseTriggered = clamped < 25;
            this[lineKey].eightyTriggered = clamped >= 80;
        }

        // Skeleton: show 50-79%, hide otherwise
        if (this[skeletonKey]) {
            this[skeletonKey].element.style.transition = 'none';
            this[skeletonKey].element.style.opacity = (clamped >= 50 && clamped < 80) ? '1' : '0';
            this[skeletonKey].triggered = clamped >= 50 && clamped < 80;
            this[skeletonKey].reverseTriggered = clamped < 50;
            this[skeletonKey].eightyTriggered = clamped >= 80;
        }

        // Popup: for sections one and two
        if (popupKey && this[popupKey]) {
            this[popupKey].element.style.transition = 'none';
            if (clamped >= 50 && clamped < 80) {
                this[popupKey].element.style.opacity = '1';
                this[popupKey].element.style.transform = 'translate(0,0)';
                this[popupKey].triggered = true;
                this[popupKey].reverseTriggered = false;
                this[popupKey].eightyTriggered = false;
            } else if (clamped >= 80) {
                this[popupKey].element.style.opacity = '0';
                this[popupKey].element.style.transform = 'translate(10px, 10px)';
                this[popupKey].eightyTriggered = true;
            } else {
                this[popupKey].element.style.opacity = '0';
                this[popupKey].element.style.transform = 'translate(-10px, 10px)';
                this[popupKey].triggered = false;
                this[popupKey].reverseTriggered = true;
                this[popupKey].eightyTriggered = false;
            }
        }

        // Section-specific popups for three
        if (section === 'three') {
            if (this.popupThreeAnimation) {
                this.popupThreeAnimation.element.style.transition = 'none';
                if (clamped >= 50 && clamped < 80) {
                    this.popupThreeAnimation.element.style.opacity = '1';
                    this.popupThreeAnimation.element.style.transform = 'translate(0,0)';
                    this.popupThreeAnimation.triggered = true;
                    this.popupThreeAnimation.reverseTriggered = false;
                } else if (clamped >= 80) {
                    this.popupThreeAnimation.element.style.opacity = '0';
                    this.popupThreeAnimation.element.style.transform = 'translate(10px, 10px)';
                    this.popupThreeAnimation.eightyTriggered = true;
                } else {
                    this.popupThreeAnimation.element.style.opacity = '0';
                    this.popupThreeAnimation.element.style.transform = 'translate(-10px, 10px)';
                    this.popupThreeAnimation.triggered = false;
                    this.popupThreeAnimation.reverseTriggered = true;
                    this.popupThreeAnimation.eightyTriggered = false;
                }
            }
            if (this.popupFourAnimation) {
                this.popupFourAnimation.element.style.transition = 'none';
                if (clamped >= 60 && clamped < 80) {
                    this.popupFourAnimation.element.style.opacity = '1';
                    this.popupFourAnimation.element.style.transform = 'translate(0,0)';
                    this.popupFourAnimation.triggered = true;
                    this.popupFourAnimation.reverseTriggered = false;
                } else if (clamped >= 80) {
                    this.popupFourAnimation.element.style.opacity = '0';
                    this.popupFourAnimation.element.style.transform = 'translate(10px, 10px)';
                    this.popupFourAnimation.eightyTriggered = true;
                } else {
                    this.popupFourAnimation.element.style.opacity = '0';
                    this.popupFourAnimation.element.style.transform = 'translate(-10px, 10px)';
                    this.popupFourAnimation.triggered = false;
                    this.popupFourAnimation.reverseTriggered = true;
                    this.popupFourAnimation.eightyTriggered = false;
                }
            }
        }

        // Icons per section
        if (section === 'one' && this.sectionOneIconsAnimation) {
            if (clamped >= 25 && clamped < 80) this.sectionOneIconsAnimation.apply(); else this.sectionOneIconsAnimation.clear();
        }
        if (section === 'two' && this.sectionTwoIconsAnimation) {
            if (clamped >= 25 && clamped < 80) this.sectionTwoIconsAnimation.apply(); else this.sectionTwoIconsAnimation.clear();
        }
        if (section === 'three' && this.sectionThreeIconsAnimation) {
            if (clamped >= 25 && clamped < 80) this.sectionThreeIconsAnimation.apply(); else this.sectionThreeIconsAnimation.clear();
        }
    }

    // Reconcile popup and skeleton states based on current percent, with hysteresis and debounce
    reconcilePopupAndSkeleton(section, rawPercent) {
        const percent = Math.max(0, Math.min(100, rawPercent));
        const margin = this.thresholdMargin;
        const debounceKey = `rec_${section}`;
        if (this.debounceTimers[debounceKey]) {
            clearTimeout(this.debounceTimers[debounceKey]);
        }
        this.debounceTimers[debounceKey] = setTimeout(() => {
            // Skeleton
            const skKey = `skeletonAnimation${section}`;
            const skeleton = this[skKey];
            if (skeleton) {
                const shouldShow = percent >= (50 + margin) && percent < (80 - margin);
                const shouldHide = percent < (50 - margin) || percent >= (80 + margin);
                if (shouldShow && skeleton.element.style.opacity !== '1') skeleton.trigger();
                if (shouldHide && skeleton.element.style.opacity !== '0') skeleton.reverse();
            }

            // Popup for sections one/two
            if (section === 'one' || section === 'two') {
                const pk = section === 'one' ? 'popupOneAnimation' : 'popupTwoAnimation';
                const popup = this[pk];
                if (popup) {
                    const inRange = percent >= (50 + margin) && percent < (80 - margin);
                    const hideRange = percent < (50 - margin) || percent >= (80 + margin);
                    if (inRange && popup.element.style.opacity !== '1') popup.trigger();
                    if (hideRange && popup.element.style.opacity !== '0') popup.reverse();
                }
            }

            // Popups for three (with no stagger on reconcile; stagger handled in main flow)
            if (section === 'three') {
                if (this.popupThreeAnimation) {
                    const inRange = percent >= (50 + margin) && percent < (80 - margin);
                    const hideRange = percent < (50 - margin) || percent >= (80 + margin);
                    if (inRange && this.popupThreeAnimation.element.style.opacity !== '1') this.popupThreeAnimation.trigger();
                    if (hideRange && this.popupThreeAnimation.element.style.opacity !== '0') this.popupThreeAnimation.reverse();
                }
                if (this.popupFourAnimation) {
                    const inRange = percent >= (60 + margin) && percent < (80 - margin);
                    const hideRange = percent < (60 - margin) || percent >= (80 + margin);
                    if (inRange && this.popupFourAnimation.element.style.opacity !== '1') this.popupFourAnimation.trigger();
                    if (hideRange && this.popupFourAnimation.element.style.opacity !== '0') this.popupFourAnimation.reverse();
                }
            }

            delete this.debounceTimers[debounceKey];
        }, this.debounceDelayMs);
    }

    init() {
        // Initialize intersection observer for scroll animations
        this.setupIntersectionObserver();
        
        // Setup scroll event listener for percentage-based animations
        this.setupScrollListener();

        // Desktop-only: ensure `.content-container` snaps fully into viewport
        // when it becomes notably visible while scrolling the outer page
        this.setupContentContainerViewportSnap();
        
        // Initialize animations
        this.setupAnimations();

        // HUD removed per request
    }

    setupIntersectionObserver() {
        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const elementId = entry.target.id;
                if (this.animations.has(elementId)) {
                    const animation = this.animations.get(elementId);
                    if (entry.isIntersecting) {
                        animation.trigger();
                    } else {
                        animation.reverse();
                    }
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -10% 0px'
        });
    }

    setupScrollListener() {
        let ticking = false;
        let lastScrollPercent = 0; // segment one
        let lastSectionTwoScrollPercent = 0; // segment two
        let lastSectionThreeScrollPercent = 0; // segment three
        const container = document.querySelector('.content-container');
        const svgScroll = this.getMobileScrollEl();
        
        const updateScrollAnimations = () => {
            // Handle segment-one animations
            const sectionOneScrollPercent = this.getSectionOneScrollPercent();
            const isScrollingDown = sectionOneScrollPercent > lastScrollPercent;
            
            this.handleLineAnimation(sectionOneScrollPercent, isScrollingDown, 'one');
            this.handleSkeletonScreenAnimation(sectionOneScrollPercent, isScrollingDown, 'one');
            this.handlePopupOneAnimation(sectionOneScrollPercent, isScrollingDown, 'one');
            this.handleEightyPercentAnimations(sectionOneScrollPercent, isScrollingDown, 'one');
            
            // Handle segment-two animations
            const sectionTwoScrollPercent = this.getSectionTwoScrollPercent();
            const isScrollingDownTwo = sectionTwoScrollPercent > lastSectionTwoScrollPercent;

            // If user jumped into section two and section-one gate not open, bring section one to its final state
            if (sectionTwoScrollPercent > 0 && !this.sectionOneGateOpen) {
                this.applySectionState('one', 100);
                this.sectionOneGateOpen = true;
            }
            
            // Gate section-two animations until section-one completes base sequence
            if (this.sectionOneGateOpen) {
                this.handleLineAnimation(sectionTwoScrollPercent, isScrollingDownTwo, 'two');
                this.handleSkeletonScreenAnimation(sectionTwoScrollPercent, isScrollingDownTwo, 'two');
                this.handlePopupOneAnimation(sectionTwoScrollPercent, isScrollingDownTwo, 'two');
                this.handleEightyPercentAnimations(sectionTwoScrollPercent, isScrollingDownTwo, 'two');
            }

            // Open gate after section-one animations fully complete, then add 1s gap
            if (!this.sectionOneGateOpen) {
                const lineOneTriggered = this.lineAnimationone && this.lineAnimationone.triggered;
                const popupOneTriggered = this.popupOneAnimation && this.popupOneAnimation.triggered;
                const skeletonOneTriggered = this.skeletonBaseTriggeredOne === true;

                // Schedule completion markers once triggers are observed
                if (lineOneTriggered && !this.sectionOneLineCompleted && !this.sectionOneLineCompletionTimer) {
                    this.sectionOneLineCompletionTimer = setTimeout(() => {
                        this.sectionOneLineCompleted = true;
                        this.sectionOneLineCompletionTimer = null;
                    }, 1000); // line transition ~1s
                }

                if (popupOneTriggered && !this.sectionOnePopupCompleted && !this.sectionOnePopupCompletionTimer) {
                    this.sectionOnePopupCompletionTimer = setTimeout(() => {
                        this.sectionOnePopupCompleted = true;
                        this.sectionOnePopupCompletionTimer = null;
                    }, 500); // popup transition ~0.5s
                }

                if (skeletonOneTriggered && !this.sectionOneSkeletonCompleted && !this.sectionOneSkeletonCompletionTimer) {
                    this.sectionOneSkeletonCompletionTimer = setTimeout(() => {
                        this.sectionOneSkeletonCompleted = true;
                        this.sectionOneSkeletonCompletionTimer = null;
                    }, 500); // skeleton transition ~0.5s
                }

                const allCompleted = this.sectionOneLineCompleted && this.sectionOnePopupCompleted && this.sectionOneSkeletonCompleted;
                if (allCompleted && !this.sectionOneGateTimer) {
                    this.sectionOneGateTimer = setTimeout(() => {
                        this.sectionOneGateOpen = true; // open gate after extra 1s gap
                        this.sectionOneGateTimer = null;
                    }, 1000);
                }

                // If user fast-scrolled and we force-triggered base states, open gate after 1s
                if (!this.sectionOneGateOpen && lineOneTriggered && popupOneTriggered && skeletonOneTriggered && !this.sectionOneGateTimer && !this.sectionOneLineCompletionTimer && !this.sectionOnePopupCompletionTimer && !this.sectionOneSkeletonCompletionTimer) {
                    this.sectionOneGateTimer = setTimeout(() => {
                        this.sectionOneGateOpen = true;
                        this.sectionOneGateTimer = null;
                    }, 1000);
                }
            }
            
            // Handle segment-three animations
            const sectionThreeScrollPercent = this.getSectionThreeScrollPercent();
            const isScrollingDownThree = sectionThreeScrollPercent > lastSectionThreeScrollPercent;

            // If user jumped into section three and section-two gate not open, bring prior sections to their final state
            if (sectionThreeScrollPercent > 0 && !this.sectionTwoGateOpen) {
                // Ensure section one
                if (!this.sectionOneGateOpen) {
                    this.applySectionState('one', 100);
                    this.sectionOneGateOpen = true;
                }
                // Ensure section two
                this.applySectionState('two', 100);
                this.sectionTwoGateOpen = true;
            }

            // Gate section-three animations until section-two completes base sequence
            if (this.sectionTwoGateOpen) {
                this.handleLineAnimation(sectionThreeScrollPercent, isScrollingDownThree, 'three');
                this.handleSkeletonScreenAnimation(sectionThreeScrollPercent, isScrollingDownThree, 'three');
                this.handlePopupThreeAnimation(sectionThreeScrollPercent, isScrollingDownThree);
                this.handlePopupFourAnimation(sectionThreeScrollPercent, isScrollingDownThree);
                this.handleEightyPercentAnimations(sectionThreeScrollPercent, isScrollingDownThree, 'three');
            }

            // Open section-three gate after section-two completes, then add 1s gap
            if (!this.sectionTwoGateOpen) {
                const lineTwoTriggered = this.lineAnimationtwo && this.lineAnimationtwo.triggered;
                const popupTwoTriggered = this.popupTwoAnimation && this.popupTwoAnimation.triggered;
                const skeletonTwoTriggered = this.skeletonBaseTriggeredTwo === true;

                if (lineTwoTriggered && !this.sectionTwoLineCompleted && !this.sectionTwoLineCompletionTimer) {
                    this.sectionTwoLineCompletionTimer = setTimeout(() => {
                        this.sectionTwoLineCompleted = true;
                        this.sectionTwoLineCompletionTimer = null;
                    }, 1000); // line transition ~1s
                }

                if (popupTwoTriggered && !this.sectionTwoPopupCompleted && !this.sectionTwoPopupCompletionTimer) {
                    this.sectionTwoPopupCompletionTimer = setTimeout(() => {
                        this.sectionTwoPopupCompleted = true;
                        this.sectionTwoPopupCompletionTimer = null;
                    }, 500); // popup transition ~0.5s
                }

                if (skeletonTwoTriggered && !this.sectionTwoSkeletonCompleted && !this.sectionTwoSkeletonCompletionTimer) {
                    this.sectionTwoSkeletonCompletionTimer = setTimeout(() => {
                        this.sectionTwoSkeletonCompleted = true;
                        this.sectionTwoSkeletonCompletionTimer = null;
                    }, 500); // skeleton transition ~0.5s
                }

                const allTwoCompleted = this.sectionTwoLineCompleted && this.sectionTwoPopupCompleted && this.sectionTwoSkeletonCompleted;
                if (allTwoCompleted && !this.sectionTwoGateTimer) {
                    this.sectionTwoGateTimer = setTimeout(() => {
                        this.sectionTwoGateOpen = true; // open gate after extra 1s gap
                        this.sectionTwoGateTimer = null;
                    }, 1000);
                }

                // If user fast-scrolled and we force-triggered base states, open gate after 1s
                if (!this.sectionTwoGateOpen && lineTwoTriggered && popupTwoTriggered && skeletonTwoTriggered && !this.sectionTwoGateTimer && !this.sectionTwoLineCompletionTimer && !this.sectionTwoPopupCompletionTimer && !this.sectionTwoSkeletonCompletionTimer) {
                    this.sectionTwoGateTimer = setTimeout(() => {
                        this.sectionTwoGateOpen = true;
                        this.sectionTwoGateTimer = null;
                    }, 1000);
                }
            }

            // No HUD

            // Reconcile to prevent stuck states during rapid scroll
            this.reconcilePopupAndSkeleton('one', sectionOneScrollPercent);
            this.reconcilePopupAndSkeleton('two', sectionTwoScrollPercent);
            this.reconcilePopupAndSkeleton('three', sectionThreeScrollPercent);

            lastScrollPercent = sectionOneScrollPercent;
            lastSectionTwoScrollPercent = sectionTwoScrollPercent;
            lastSectionThreeScrollPercent = sectionThreeScrollPercent;
            ticking = false;
        };

        const onScroll = () => {
            if (!ticking) {
                requestAnimationFrame(updateScrollAnimations);
                ticking = true;
            }
        };
        if (container) container.addEventListener('scroll', onScroll, { passive: true });
        if (svgScroll) svgScroll.addEventListener('scroll', onScroll, { passive: true });
        updateScrollAnimations();
    }

    // Ensure on desktop that when `.content-container` becomes noticeably visible
    // (>10% of its height) during page scroll, we smoothly bring it fully into view.
    // Do not interfere when the user is actively scrolling inside the container.
    setupContentContainerViewportSnap() {
        try {
            const isDesktop = !window.matchMedia('(max-width: 600px)').matches;

            // Targets per platform
            const desktopTarget = document.querySelector('.content-container');
            const mobileTarget = document.querySelector('.svg-column');
            const mobileInnerScrollable = document.querySelector('.svg-container');

            if (isDesktop && !desktopTarget) return;
            if (!isDesktop && !mobileTarget) return;

            let lastWindowScrollY = window.scrollY;
            let lastDirection = 'down';
            let lastPointerTarget = null; // wheel/touch origin
            let lastTouchY = null;
            let isSnapping = false;
            let snapCooldownTimer = null;
            let armedToSnap = true; // hysteresis to avoid repeated snapping

            const clearCooldown = () => {
                if (snapCooldownTimer) {
                    clearTimeout(snapCooldownTimer);
                    snapCooldownTimer = null;
                }
            };

            const startCooldown = () => {
                clearCooldown();
                snapCooldownTimer = setTimeout(() => {
                    isSnapping = false;
                    snapCooldownTimer = null;
                }, 1000);
            };

            // Track scroll direction
            window.addEventListener('scroll', () => {
                const currentY = window.scrollY;
                lastDirection = currentY > lastWindowScrollY ? 'down' : 'up';
                lastWindowScrollY = currentY;
            }, { passive: true });

            // Pointer origin + direction (wheel)
            window.addEventListener('wheel', (event) => {
                lastPointerTarget = event.target;
                if (event.deltaY !== 0) {
                    lastDirection = event.deltaY > 0 ? 'down' : 'up';
                }
            }, { passive: true, capture: true });

            // Pointer origin + direction (touch)
            window.addEventListener('touchstart', (event) => {
                lastPointerTarget = event.targetTouches && event.targetTouches[0] ? event.targetTouches[0].target : event.target;
                if (event.touches && event.touches[0]) {
                    lastTouchY = event.touches[0].clientY;
                }
            }, { passive: true, capture: true });
            window.addEventListener('touchmove', (event) => {
                if (event.touches && event.touches[0] && lastTouchY != null) {
                    const currentY = event.touches[0].clientY;
                    lastDirection = currentY < lastTouchY ? 'down' : 'up';
                    lastTouchY = currentY;
                }
            }, { passive: true, capture: true });

            const canScrollFurther = (el, direction) => {
                if (!el) return false;
                const maxScrollTop = el.scrollHeight - el.clientHeight;
                if (direction === 'down') {
                    return el.scrollTop < maxScrollTop - 1;
                }
                return el.scrollTop > 1; // up
            };

            const isPointerInside = (el) => {
                return !!lastPointerTarget && el && el.contains(lastPointerTarget);
            };

            const snapIntoView = (el) => {
                if (!el) return;
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            };

            const waitUntilAlignedOrTimeout = (el) => {
                const tolerancePx = 2;
                const startTime = Date.now();
                const maxMs = 1200;
                const onScrollCheck = () => {
                    if (!isSnapping) return;
                    const rect = el.getBoundingClientRect();
                    if (Math.abs(rect.top) <= tolerancePx) {
                        isSnapping = false;
                        startCooldown();
                        window.removeEventListener('scroll', onScrollCheck, true);
                    } else if (Date.now() - startTime > maxMs) {
                        isSnapping = false;
                        startCooldown();
                        window.removeEventListener('scroll', onScrollCheck, true);
                    }
                };
                window.addEventListener('scroll', onScrollCheck, { passive: true, capture: true });
            };

            const targetEl = isDesktop ? desktopTarget : mobileTarget;
            const innerScrollableEl = isDesktop ? desktopTarget : (mobileInnerScrollable || mobileTarget);

            const observer = new IntersectionObserver((entries) => {
                if (!entries || !entries.length) return;
                const entry = entries[0];
                const ratio = entry.intersectionRatio || 0;
                if (isSnapping) return;

                // Re-arm hysteresis when mostly out of view to prevent rapid re-triggers
                if (ratio <= 0.05) {
                    armedToSnap = true;
                }

                if (ratio >= 0.10 && armedToSnap) {
                    const inside = isPointerInside(innerScrollableEl);
                    if (inside && canScrollFurther(innerScrollableEl, lastDirection)) {
                        return; // let inner scroll proceed
                    }
                    if (ratio >= 0.98) {
                        return; // already fully in view
                    }
                    isSnapping = true;
                    armedToSnap = false;
                    snapIntoView(targetEl);
                    waitUntilAlignedOrTimeout(targetEl);
                    startCooldown();
                }
            }, { threshold: [0, 0.1, 0.98] });

            observer.observe(targetEl);
        } catch (error) {
            // Fail safe: never break animations if snap setup fails
            // eslint-disable-next-line no-console
            console.warn('setupContentContainerViewportSnap failed:', error);
        }
    }

    // HUD removed

    // Public method to adjust start offsets from outside (e.g., inline in index.html)
    setSectionStartOffset(section, percent) {
        if (!['one', 'two', 'three'].includes(section)) return;
        const clamped = Math.max(-100, Math.min(100, Number(percent) || 0));
        this.sectionStartOffset[section] = clamped;
        // No HUD
    }

    setupAnimations() {
        // Setup line animations for all sections
        this.setupLineAnimation('one');
        this.setupLineAnimation('two');
        this.setupLineAnimation('three');
        
        // Setup skeleton screens per section
        this.setupSkeletonScreenAnimation('one');
        this.setupSkeletonScreenAnimation('two');
        this.setupSkeletonScreenAnimation('three');
        
        // Setup popup animations for all sections
        this.setupPopupOneAnimation('one');
        this.setupPopupOneAnimation('two');
        this.setupPopupThreeAnimation();
        this.setupPopupFourAnimation();
        // Setup section-one icons animation
        this.setupSectionOneIconsAnimation();
        this.setupSectionTwoIconsAnimation();
        this.setupSectionThreeIconsAnimation();
    }

    setupLineAnimation(section) {
        const lineElement = document.querySelector(`#lineanimation${section}`);
        if (lineElement) {
            // Check if it uses path or line elements
            const paths = lineElement.querySelectorAll('path');
            const lines = lineElement.querySelectorAll('line');
            const elements = paths.length > 0 ? paths : lines;
            
            // Calculate stroke-dasharray and stroke-dashoffset for each element
            elements.forEach(element => {
                const length = element.getTotalLength();
                element.style.strokeDasharray = length;
                // Sections two and three start from negative total length to 0 at 25%
                element.style.strokeDashoffset = (section === 'two' || section === 'three') ? -length : length;
                // Set initial opacity to 0 for line animations
                element.style.opacity = '0';
            });

            // Set initial state for 80% animation (negative stroke-dashoffset)
            elements.forEach(element => {
                const length = element.getTotalLength();
                element.setAttribute('data-negative-offset', `-${length}`);
            });

            // Create animation object
            this[`lineAnimation${section}`] = {
                element: lineElement,
                elements: elements,
                triggered: false,
                reverseTriggered: false,
                eightyTriggered: false,
                trigger: () => {
                    if (this[`lineAnimation${section}`].triggered) return;
                    
                    this[`lineAnimation${section}`].elements.forEach(element => {
                        element.style.transition = 'stroke-dashoffset 1s ease, opacity 1s ease';
                        element.style.strokeDashoffset = '0';
                        element.style.opacity = '1';
                    });
                    
                    this[`lineAnimation${section}`].triggered = true;
                    this[`lineAnimation${section}`].reverseTriggered = false;
                },
                reverse: () => {
                    if (this[`lineAnimation${section}`].reverseTriggered) return;
                    
                    this[`lineAnimation${section}`].elements.forEach(element => {
                        const length = element.getTotalLength();
                        element.style.transition = 'stroke-dashoffset 1s ease, opacity 1s ease';
                        // For sections two and three, reverse back to negative length; others to positive length
                        element.style.strokeDashoffset = (section === 'two' || section === 'three') ? -length : length;
                        element.style.opacity = '0';
                    });
                    
                    this[`lineAnimation${section}`].reverseTriggered = true;
                    this[`lineAnimation${section}`].triggered = false;
                }
            };
        }
    }

    setupPopupThreeAnimation() {
        const popupElement = document.querySelector('#popupthree');
        if (popupElement) {
            // Initially hide the element
            popupElement.style.opacity = '0';
            popupElement.style.transform = 'translate(-10px, 10px)';
            popupElement.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            
            this.popupThreeAnimation = {
                element: popupElement,
                triggered: false,
                reverseTriggered: false,
                eightyTriggered: false,
                trigger: () => {
                    if (this.popupThreeAnimation.triggered) return;
                    
                    this.popupThreeAnimation.element.style.opacity = '1';
                    this.popupThreeAnimation.element.style.transform = 'translate(0,0)';
                    this.popupThreeAnimation.triggered = true;
                    this.popupThreeAnimation.reverseTriggered = false;
                },
                reverse: () => {
                    if (this.popupThreeAnimation.reverseTriggered) return;
                    
                    this.popupThreeAnimation.element.style.opacity = '0';
                    this.popupThreeAnimation.element.style.transform = 'translate(-10px, 10px)';
                    this.popupThreeAnimation.reverseTriggered = true;
                    this.popupThreeAnimation.triggered = false;
                }
            };
        }
    }

    setupPopupFourAnimation() {
        const popupElement = document.querySelector('#popupfour');
        if (popupElement) {
            // Initially hide the element
            popupElement.style.opacity = '0';
            popupElement.style.transform = 'translate(-10px, 10px)';
            popupElement.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            
            this.popupFourAnimation = {
                element: popupElement,
                triggered: false,
                reverseTriggered: false,
                eightyTriggered: false,
                trigger: () => {
                    if (this.popupFourAnimation.triggered) return;
                    
                    this.popupFourAnimation.element.style.opacity = '1';
                    this.popupFourAnimation.element.style.transform = 'translate(0,0)';
                    this.popupFourAnimation.triggered = true;
                    this.popupFourAnimation.reverseTriggered = false;
                },
                reverse: () => {
                    if (this.popupFourAnimation.reverseTriggered) return;
                    
                    this.popupFourAnimation.element.style.opacity = '0';
                    this.popupFourAnimation.element.style.transform = 'translate(-10px, 10px)';
                    this.popupFourAnimation.reverseTriggered = true;
                    this.popupFourAnimation.triggered = false;
                }
            };
        }
    }

    setupSectionOneIconsAnimation() {
        const device = document.getElementById('Device');
        const labor = document.getElementById('Labor & equipment');
        const testing = document.getElementById('Testing');
        const checklist = document.getElementById('Checklist');
        const materials = document.getElementById('Materials/Default');
        const issues = document.getElementById('Issues 2');

        const others = [labor, testing, checklist, materials, issues].filter(Boolean);
        if (!device && others.length === 0) return;

        // Smooth opacity transition
        [device, ...others].forEach(el => { if (el) el.style.transition = 'opacity 0.5s ease'; });

        this.sectionOneIconsAnimation = {
            device,
            others,
            apply: () => {
                this.sectionOneIconsAnimation.others.forEach(el => { el.style.opacity = '0.5'; });
                if (this.sectionOneIconsAnimation.device) this.sectionOneIconsAnimation.device.style.opacity = '1';
            },
            clear: () => {
                this.sectionOneIconsAnimation.others.forEach(el => { el.style.opacity = '1'; });
                if (this.sectionOneIconsAnimation.device) this.sectionOneIconsAnimation.device.style.opacity = '1';
            }
        };
    }

    setupSectionTwoIconsAnimation() {
        const device = document.getElementById('Device');
        const labor = document.getElementById('Labor & equipment');
        const testing = document.getElementById('Testing');
        const checklist = document.getElementById('Checklist');
        const materials = document.getElementById('Materials/Default');
        const issues = document.getElementById('Issues 2');

        const others = [device, labor, testing, checklist, issues].filter(Boolean);
        if (!materials && others.length === 0) return;

        [materials, ...others].forEach(el => { if (el) el.style.transition = 'opacity 0.5s ease'; });

        this.sectionTwoIconsAnimation = {
            focus: materials,
            others,
            apply: () => {
                this.sectionTwoIconsAnimation.others.forEach(el => { el.style.opacity = '0.5'; });
                if (this.sectionTwoIconsAnimation.focus) this.sectionTwoIconsAnimation.focus.style.opacity = '1';
            },
            clear: () => {
                this.sectionTwoIconsAnimation.others.forEach(el => { el.style.opacity = '1'; });
                if (this.sectionTwoIconsAnimation.focus) this.sectionTwoIconsAnimation.focus.style.opacity = '1';
            }
        };
    }

    setupSectionThreeIconsAnimation() {
        const device = document.getElementById('Device');
        const labor = document.getElementById('Labor & equipment');
        const testing = document.getElementById('Testing');
        const checklist = document.getElementById('Checklist');
        const materials = document.getElementById('Materials/Default');
        const issues = document.getElementById('Issues 2');

        const others = [device, labor, checklist, materials, issues].filter(Boolean);
        if (!testing && others.length === 0) return;

        [testing, ...others].forEach(el => { if (el) el.style.transition = 'opacity 0.5s ease'; });

        this.sectionThreeIconsAnimation = {
            focus: testing,
            others,
            apply: () => {
                this.sectionThreeIconsAnimation.others.forEach(el => { el.style.opacity = '0.5'; });
                if (this.sectionThreeIconsAnimation.focus) this.sectionThreeIconsAnimation.focus.style.opacity = '1';
            },
            clear: () => {
                this.sectionThreeIconsAnimation.others.forEach(el => { el.style.opacity = '1'; });
                if (this.sectionThreeIconsAnimation.focus) this.sectionThreeIconsAnimation.focus.style.opacity = '1';
            }
        };
    }

    setupSkeletonScreenAnimation(section) {
        const id = section === 'one' ? '#skeletonScreenone' : section === 'two' ? '#skeletonScreentwo' : '#skeletonScreenthree';
        const skeletonElement = document.querySelector(id);
        if (skeletonElement) {
            // Initially hide the element
            skeletonElement.style.opacity = '0';
            skeletonElement.style.transition = 'opacity 0.5s ease';
            
            this[`skeletonAnimation${section}`] = {
                element: skeletonElement,
                triggered: false,
                reverseTriggered: false,
                eightyTriggered: false,
                trigger: () => {
                    if (this[`skeletonAnimation${section}`].triggered) return;
                    
                    this[`skeletonAnimation${section}`].element.style.opacity = '1';
                    this[`skeletonAnimation${section}`].triggered = true;
                    this[`skeletonAnimation${section}`].reverseTriggered = false;
                },
                reverse: () => {
                    if (this[`skeletonAnimation${section}`].reverseTriggered) return;
                    
                    this[`skeletonAnimation${section}`].element.style.opacity = '0';
                    this[`skeletonAnimation${section}`].reverseTriggered = true;
                    this[`skeletonAnimation${section}`].triggered = false;
                }
            };
        }
    }

    setupPopupOneAnimation(section) {
        const popupId = section === 'one' ? 'popupone' : 'popuptwo';
        const popupElement = document.querySelector(`#${popupId}`);
        if (popupElement) {
            // Initially hide the element
            popupElement.style.opacity = '0';
            popupElement.style.transform = 'translate(-10px, 10px)';
            popupElement.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            
            const animationKey = `popup${section === 'one' ? 'One' : 'Two'}Animation`;
            this[animationKey] = {
                element: popupElement,
                triggered: false,
                reverseTriggered: false,
                eightyTriggered: false,
                trigger: () => {
                    if (this[animationKey].triggered) return;
                    
                    this[animationKey].element.style.opacity = '1';
                    this[animationKey].element.style.transform = 'translate(0,0)';
                    this[animationKey].triggered = true;
                    this[animationKey].reverseTriggered = false;
                },
                reverse: () => {
                    if (this[animationKey].reverseTriggered) return;
                    
                    this[animationKey].element.style.opacity = '0';
                    this[animationKey].element.style.transform = 'translate(-10px,10px)';
                    this[animationKey].reverseTriggered = true;
                    this[animationKey].triggered = false;
                }
            };
        }
    }

    handleLineAnimation(scrollPercent, isScrollingDown, section) {
        const animationKey = `lineAnimation${section}`;
        if (!this[animationKey]) return;
        
        if (isScrollingDown) {
            // Scrolling down - trigger animation at 25%
            if (scrollPercent >= 25 && !this[animationKey].triggered) {
                // For sections two and three, ensure we animate to 0 from negative length
                if (section === 'two' || section === 'three') {
                    this[animationKey].elements.forEach(element => {
                        element.style.transition = 'stroke-dashoffset 1s ease, opacity 1s ease';
                        element.style.strokeDashoffset = '0';
                        element.style.opacity = '1';
                    });
                    this[animationKey].triggered = true;
                    this[animationKey].reverseTriggered = false;
                } else {
                    this[animationKey].trigger();
                }
                // Along with section line animation, update icons opacity pattern per section
                if (section === 'one' && this.sectionOneIconsAnimation) this.sectionOneIconsAnimation.apply();
                if (section === 'two' && this.sectionTwoIconsAnimation) this.sectionTwoIconsAnimation.apply();
                if (section === 'three' && this.sectionThreeIconsAnimation) this.sectionThreeIconsAnimation.apply();
            }
        } else {
            // Scrolling up - reverse animation below 25%
            if (scrollPercent < 25 && !this[animationKey].reverseTriggered) {
                this[animationKey].reverse();
                if (section === 'one' && this.sectionOneIconsAnimation) this.sectionOneIconsAnimation.clear();
                if (section === 'two' && this.sectionTwoIconsAnimation) this.sectionTwoIconsAnimation.clear();
                if (section === 'three' && this.sectionThreeIconsAnimation) this.sectionThreeIconsAnimation.clear();
            }
        }
    }

    handleSkeletonScreenAnimation(scrollPercent, isScrollingDown, section) {
        const animationKey = `skeletonAnimation${section}`;
        if (!this[animationKey]) return;
        
        if (isScrollingDown) {
            // Scrolling down - trigger animation at 50% (along with popup)
            if (scrollPercent >= 50 && !this[animationKey].triggered) {
                this[animationKey].trigger();
                // Track which section triggered base skeleton
                if (section === 'one') this.skeletonBaseTriggeredOne = true;
                if (section === 'two') this.skeletonBaseTriggeredTwo = true;
            }
        } else {
            // Scrolling up - reverse animation below 50%
            if (scrollPercent < 50 && !this[animationKey].reverseTriggered) {
                this[animationKey].reverse();
                if (section === 'one') this.skeletonBaseTriggeredOne = false;
                if (section === 'two') this.skeletonBaseTriggeredTwo = false;
            }
        }
    }

    handlePopupOneAnimation(scrollPercent, isScrollingDown, section) {
        const animationKey = `popup${section === 'one' ? 'One' : 'Two'}Animation`;
        if (!this[animationKey]) return;
        
        if (isScrollingDown) {
            // Scrolling down - trigger animation at 50%
            if (scrollPercent >= 50 && !this[animationKey].triggered) {
                this[animationKey].trigger();
            }
        } else {
            // Scrolling up - reverse animation below 50% (with hysteresis)
            const margin = this.thresholdMargin;
            if ((scrollPercent < (50 - margin)) && !this[animationKey].reverseTriggered) {
                this[animationKey].reverse();
            }
        }
    }

    handlePopupThreeAnimation(scrollPercent, isScrollingDown) {
        if (!this.popupThreeAnimation) return;
        
        if (isScrollingDown) {
            // Scrolling down - trigger animation at 50%
            if (scrollPercent >= 50 && !this.popupThreeAnimation.triggered) {
                this.popupThreeAnimation.trigger();
            }
        } else {
            // Scrolling up - reverse animation below 50% (with hysteresis)
            const margin = this.thresholdMargin;
            if ((scrollPercent < (50 - margin)) && !this.popupThreeAnimation.reverseTriggered) {
                this.popupThreeAnimation.reverse();
            }
        }
    }

    handlePopupFourAnimation(scrollPercent, isScrollingDown) {
        if (!this.popupFourAnimation) return;

        if (isScrollingDown) {
            // Scrolling down - trigger animation at 60% (no time delay)
            if (scrollPercent >= 60 && !this.popupFourAnimation.triggered) {
                this.popupFourAnimation.trigger();
            }
        } else {
            // Scrolling up - reverse with hysteresis below 60%
            const margin = this.thresholdMargin;
            if ((scrollPercent < (60 - margin)) && !this.popupFourAnimation.reverseTriggered) {
                this.popupFourAnimation.reverse();
            }
        }
    }

    handleEightyPercentAnimations(scrollPercent, isScrollingDown, section) {
        if (isScrollingDown) {
            // Scrolling down - trigger 80% animations
            if (scrollPercent >= 80) {
                this.handleLineAnimationEighty(scrollPercent, section);
                this.handleSkeletonAnimationEighty(scrollPercent, section);
                this.handlePopupAnimationEighty(scrollPercent, section);
                if (section === 'one' && this.sectionOneIconsAnimation) this.sectionOneIconsAnimation.clear();
                if (section === 'two' && this.sectionTwoIconsAnimation) this.sectionTwoIconsAnimation.clear();
                if (section === 'three' && this.sectionThreeIconsAnimation) this.sectionThreeIconsAnimation.clear();
                // Section-three specific at 80%
                if (section === 'three') {
                    this.handlePopupThreeAnimationEighty(scrollPercent);
                    this.handlePopupFourAnimationEighty(scrollPercent);
                }
            }
        } else {
            // Scrolling up - reverse 80% animations below 80%
            if (scrollPercent < 80) {
                this.handleLineAnimationEightyReverse(scrollPercent, section);
                this.handleSkeletonAnimationEightyReverse(scrollPercent, section);
                this.handlePopupAnimationEightyReverse(scrollPercent, section);
                const lineVisible = this[`lineAnimation${section}`] && this[`lineAnimation${section}`].triggered;
                if (lineVisible) {
                    if (section === 'one' && this.sectionOneIconsAnimation) this.sectionOneIconsAnimation.apply();
                    if (section === 'two' && this.sectionTwoIconsAnimation) this.sectionTwoIconsAnimation.apply();
                    if (section === 'three' && this.sectionThreeIconsAnimation) this.sectionThreeIconsAnimation.apply();
                }
                if (section === 'three') {
                    this.handlePopupThreeAnimationEightyReverse(scrollPercent);
                    this.handlePopupFourAnimationEightyReverse(scrollPercent);
                }
            }
        }
    }

    handleLineAnimationEighty(scrollPercent, section) {
        const animationKey = `lineAnimation${section}`;
        if (!this[animationKey] || this[animationKey].eightyTriggered) return;
        
        this[animationKey].elements.forEach(element => {
            const length = element.getTotalLength();
            const negativeOffset = element.getAttribute('data-negative-offset');
            element.style.transition = 'stroke-dashoffset 1s ease, opacity 1s ease';
            if (section === 'two' || section === 'three') {
                // At 80% for sections two and three, set to positive total length
                element.style.strokeDashoffset = length;
            } else {
                // Section one: set to negative length
                element.style.strokeDashoffset = negativeOffset;
            }
            element.style.opacity = '1';
        });
        
        this[animationKey].eightyTriggered = true;
    }

    handleLineAnimationEightyReverse(scrollPercent, section) {
        const animationKey = `lineAnimation${section}`;
        if (!this[animationKey] || !this[animationKey].eightyTriggered) return;
        
        this[animationKey].elements.forEach(element => {
            element.style.transition = 'stroke-dashoffset 1s ease, opacity 1s ease';
            element.style.strokeDashoffset = '0';
            element.style.opacity = '1';
        });
        
        this[animationKey].eightyTriggered = false;
    }

    handleSkeletonAnimationEighty(scrollPercent, section) {
        const animKey = `skeletonAnimation${section}`;
        if (!this[animKey] || this[animKey].eightyTriggered) return;
        this[animKey].element.style.opacity = '0';
        this[animKey].eightyTriggered = true;
    }

    handleSkeletonAnimationEightyReverse(scrollPercent, section) {
        const animKey = `skeletonAnimation${section}`;
        if (!this[animKey] || !this[animKey].eightyTriggered) return;
        // Below 80%: if past 50% show skeleton (to align with popup), else keep hidden
        this[animKey].element.style.opacity = scrollPercent >= 50 ? '1' : '0';
        this[animKey].eightyTriggered = false;
    }

    handlePopupAnimationEighty(scrollPercent, section) {
        // Only handle sections one and two here; section three has its own handlers
        if (section === 'three') return;
        
        const animationKey = `popup${section === 'one' ? 'One' : 'Two'}Animation`;
        if (!this[animationKey] || this[animationKey].eightyTriggered) return;
        
        this[animationKey].element.style.opacity = '0';
        this[animationKey].element.style.transform = 'translate(10px, 10px)';
        this[animationKey].eightyTriggered = true;
    }

    handlePopupAnimationEightyReverse(scrollPercent, section) {
        // Only handle sections one and two here; section three has its own handlers
        if (section === 'three') return;
        
        const animationKey = `popup${section === 'one' ? 'One' : 'Two'}Animation`;
        if (!this[animationKey] || !this[animationKey].eightyTriggered) return;
        
        this[animationKey].element.style.opacity = '1';
        this[animationKey].element.style.transform = 'translate(0, 0)';
        this[animationKey].eightyTriggered = false;
    }

    handlePopupThreeAnimationEighty(scrollPercent) {
        if (!this.popupThreeAnimation || this.popupThreeAnimation.eightyTriggered) return;
        
        this.popupThreeAnimation.element.style.opacity = '0';
        this.popupThreeAnimation.element.style.transform = 'translate(10px, 10px)';
        this.popupThreeAnimation.eightyTriggered = true;
    }

    handlePopupThreeAnimationEightyReverse(scrollPercent) {
        if (!this.popupThreeAnimation || !this.popupThreeAnimation.eightyTriggered) return;
        
        this.popupThreeAnimation.element.style.opacity = '1';
        this.popupThreeAnimation.element.style.transform = 'translate(0, 0)';
        this.popupThreeAnimation.eightyTriggered = false;
    }

    handlePopupFourAnimationEighty(scrollPercent) {
        if (!this.popupFourAnimation || this.popupFourAnimation.eightyTriggered) return;
        
        this.popupFourAnimation.element.style.opacity = '0';
        this.popupFourAnimation.element.style.transform = 'translate(10px, 10px)';
        this.popupFourAnimation.eightyTriggered = true;
    }

    handlePopupFourAnimationEightyReverse(scrollPercent) {
        if (!this.popupFourAnimation || !this.popupFourAnimation.eightyTriggered) return;
        
        this.popupFourAnimation.element.style.opacity = '1';
        this.popupFourAnimation.element.style.transform = 'translate(0, 0)';
        this.popupFourAnimation.eightyTriggered = false;
    }

    getSectionOneScrollPercent() {
        // Virtual segment 1: desktop uses content-container; mobile uses svg-container
        const isMobile = window.matchMedia('(max-width: 600px)').matches;
        const el = isMobile ? this.getMobileScrollEl() : document.querySelector('.content-container');
        if (!el) return 0;
        const viewH = el.clientHeight || window.innerHeight;
        const top = el.scrollTop || 0;
        const percent = (top / viewH) * 100;
        return Math.max(0, Math.min(100, percent));
    }

    getSectionTwoScrollPercent() {
        const isMobile = window.matchMedia('(max-width: 600px)').matches;
        const el = isMobile ? this.getMobileScrollEl() : document.querySelector('.content-container');
        if (!el) return 0;
        const viewH = el.clientHeight || window.innerHeight;
        const top = el.scrollTop || 0;
        const percent = ((top - viewH) / viewH) * 100;
        return Math.max(0, Math.min(100, percent));
    }

    getSectionThreeScrollPercent() {
        const isMobile = window.matchMedia('(max-width: 600px)').matches;
        const el = isMobile ? this.getMobileScrollEl() : document.querySelector('.content-container');
        if (!el) return 0;
        const viewH = el.clientHeight || window.innerHeight;
        const top = el.scrollTop || 0;
        const percent = ((top - 2 * viewH) / viewH) * 100;
        return Math.max(0, Math.min(100, percent));
    }

    getScrollPercent() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        return (scrollTop / docHeight) * 100;
    }

    // Utility function to calculate stroke-dasharray and stroke-dashoffset
    calculateStrokeDash(path) {
        const length = path.getTotalLength();
        return {
            dasharray: length,
            dashoffset: length
        };
    }

    // Function to animate any SVG path stroke
    animatePathStroke(pathId, duration = 2, easing = 'ease') {
        const path = document.querySelector(pathId);
        if (!path) return;

        const { dasharray, dashoffset } = this.calculateStrokeDash(path);
        
        // Set initial state
        path.style.strokeDasharray = dasharray;
        path.style.strokeDashoffset = dashoffset;
        path.style.transition = `stroke-dashoffset ${duration}s ${easing}`;
        
        // Trigger animation
        setTimeout(() => {
            path.style.strokeDashoffset = '0';
        }, 100);
    }

    // Function to reset animations (useful for testing)
    resetAnimations() {
        this.animations.forEach(animation => {
            animation.triggered = false;
            animation.reverseTriggered = false;
        });
        
        // Reset line animations for all sections
        ['one', 'two'].forEach(section => {
            const animationKey = `lineAnimation${section}`;
            if (this[animationKey]) {
                this[animationKey].triggered = false;
                this[animationKey].reverseTriggered = false;
                this[animationKey].eightyTriggered = false;
                this[animationKey].elements.forEach(element => {
                    const length = element.getTotalLength();
                    element.style.strokeDashoffset = length;
                    element.style.opacity = '0';
                    // Reset 80% animation state
                    const negativeOffset = element.getAttribute('data-negative-offset');
                    if (negativeOffset) {
                        element.style.strokeDashoffset = negativeOffset;
                    }
                });
            }
        });
        
        if (this.skeletonAnimation) {
            this.skeletonAnimation.triggered = false;
            this.skeletonAnimation.reverseTriggered = false;
            this.skeletonAnimation.eightyTriggered = false;
            this.skeletonAnimation.element.style.opacity = '0';
        }
        
        // Reset popup animations for all sections
        if (this.popupOneAnimation) {
            this.popupOneAnimation.triggered = false;
            this.popupOneAnimation.reverseTriggered = false;
            this.popupOneAnimation.eightyTriggered = false;
            this.popupOneAnimation.element.style.opacity = '0';
            this.popupOneAnimation.element.style.transform = 'translate(-10px, 10px)';
        }
        
        if (this.popupTwoAnimation) {
            this.popupTwoAnimation.triggered = false;
            this.popupTwoAnimation.reverseTriggered = false;
            this.popupTwoAnimation.eightyTriggered = false;
            this.popupTwoAnimation.element.style.opacity = '0';
            this.popupTwoAnimation.element.style.transform = 'translate(-10px, 10px)';
        }

        if (this.popupThreeAnimation) {
            this.popupThreeAnimation.triggered = false;
            this.popupThreeAnimation.reverseTriggered = false;
            this.popupThreeAnimation.eightyTriggered = false;
            this.popupThreeAnimation.element.style.opacity = '0';
            this.popupThreeAnimation.element.style.transform = 'translate(-10px, 10px)';
        }

        if (this.popupFourAnimation) {
            this.popupFourAnimation.triggered = false;
            this.popupFourAnimation.reverseTriggered = false;
            this.popupFourAnimation.eightyTriggered = false;
            this.popupFourAnimation.element.style.opacity = '0';
            this.popupFourAnimation.element.style.transform = 'translate(-10px, 10px)';
        }
    }
}

// Initialize animations when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.scrollAnimations = new ScrollAnimations();
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ScrollAnimations;
}
