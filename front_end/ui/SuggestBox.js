/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @interface
 */
WebInspector.SuggestBoxDelegate = function()
{
}

WebInspector.SuggestBoxDelegate.prototype = {
    /**
     * @param {string} suggestion
     * @param {boolean=} isIntermediateSuggestion
     */
    applySuggestion: function(suggestion, isIntermediateSuggestion) { },

    /**
     * acceptSuggestion will be always called after call to applySuggestion with isIntermediateSuggestion being equal to false.
     */
    acceptSuggestion: function() { },
}

/**
 * @constructor
 * @implements {WebInspector.ViewportControl.Provider}
 * @param {!WebInspector.SuggestBoxDelegate} suggestBoxDelegate
 * @param {number=} maxItemsHeight
 * @param {boolean=} captureEnter
 */
WebInspector.SuggestBox = function(suggestBoxDelegate, maxItemsHeight, captureEnter)
{
    this._suggestBoxDelegate = suggestBoxDelegate;
    this._length = 0;
    this._selectedIndex = -1;
    this._selectedElement = null;
    this._maxItemsHeight = maxItemsHeight;
    this._maybeHideBound = this._maybeHide.bind(this);
    this._container = createElementWithClass("div", "suggest-box-container");
    this._viewport = new WebInspector.ViewportControl(this);
    this._element = this._viewport.element;
    this._element.classList.add("suggest-box");
    this._container.appendChild(this._element);
    this._element.addEventListener("mousedown", this._onBoxMouseDown.bind(this), true);
    this._detailsPopup = this._container.createChild("div", "suggest-box details-popup monospace");
    this._detailsPopup.classList.add("hidden");
    this._asyncDetailsCallback = null;
    /** @type {!Map<number, !Promise<{detail: string, description: string}>>} */
    this._asyncDetailsPromises = new Map();
    this._userInteracted = false;
    this._captureEnter = captureEnter;
    this._elementList = [];
    this._rowHeight = 17; // Default
}

/**
 * @typedef {!Array.<{title: string, className: (string|undefined)}>}
 */
WebInspector.SuggestBox.Suggestions;

WebInspector.SuggestBox.prototype = {
    /**
     * @return {boolean}
     */
    visible: function()
    {
        return !!this._container.parentElement;
    },

    /**
     * @param {!AnchorBox} anchorBox
     */
    setPosition: function(anchorBox)
    {
        this._updateBoxPosition(anchorBox);
    },

    /**
     * @param {!AnchorBox} anchorBox
     */
    _updateBoxPosition: function(anchorBox)
    {
        console.assert(this._overlay);
        if (this._lastAnchorBox && this._lastAnchorBox.equals(anchorBox))
            return;
        this._lastAnchorBox = anchorBox;

        // Position relative to main DevTools element.
        var container = WebInspector.Dialog.modalHostView().element;
        anchorBox = anchorBox.relativeToElement(container);
        var totalHeight = container.offsetHeight;
        var aboveHeight = anchorBox.y;
        var underHeight = totalHeight - anchorBox.y - anchorBox.height;

        this._overlay.setLeftOffset(anchorBox.x);

        var under = underHeight >= aboveHeight;
        if (under)
            this._overlay.setVerticalOffset(anchorBox.y + anchorBox.height, true);
        else
            this._overlay.setVerticalOffset(totalHeight - anchorBox.y, false);

        /** const */ var spacer = 6;
        var maxHeight = this._maxItemsHeight ? this._maxItemsHeight * this._rowHeight : Math.max(underHeight, aboveHeight) - spacer;
        var height = this._rowHeight * this._elementList.length;
        this._element.style.width = height > maxHeight ? "100vw" : "";
        this._element.style.height = Math.min(maxHeight, height) + "px";
    },

    /**
     * @param {!Event} event
     */
    _onBoxMouseDown: function(event)
    {
        if (this._hideTimeoutId) {
            window.clearTimeout(this._hideTimeoutId);
            delete this._hideTimeoutId;
        }
        event.preventDefault();
    },

    _maybeHide: function()
    {
        if (!this._hideTimeoutId)
            this._hideTimeoutId = window.setTimeout(this.hide.bind(this), 0);
    },

    /**
     * // FIXME: make SuggestBox work for multiple documents.
     * @suppressGlobalPropertiesCheck
     */
    _show: function()
    {
        if (this.visible())
            return;
        this._bodyElement = document.body;
        this._bodyElement.addEventListener("mousedown", this._maybeHideBound, true);
        this._overlay = new WebInspector.SuggestBox.Overlay();
        this._overlay.setContentElement(this._container);
        var measuringElement = this._createItemElement("1", "12");
        this._viewport.contentElement().appendChild(measuringElement);
        this._rowHeight = measuringElement.offsetHeight;
        measuringElement.remove();
    },

    hide: function()
    {
        if (!this.visible())
            return;

        this._userInteracted = false;
        this._bodyElement.removeEventListener("mousedown", this._maybeHideBound, true);
        delete this._bodyElement;
        this._container.remove();
        this._overlay.dispose();
        delete this._overlay;
        delete this._selectedElement;
        this._selectedIndex = -1;
        delete this._lastAnchorBox;
    },

    removeFromElement: function()
    {
        this.hide();
    },

    /**
     * @param {boolean=} isIntermediateSuggestion
     */
    _applySuggestion: function(isIntermediateSuggestion)
    {
        if (this._onlyCompletion) {
            this._suggestBoxDelegate.applySuggestion(this._onlyCompletion, isIntermediateSuggestion);
            return true;
        }

        if (!this.visible() || !this._selectedElement)
            return false;

        var suggestion = this._selectedElement.__fullValue;
        if (!suggestion)
            return false;

        this._suggestBoxDelegate.applySuggestion(suggestion, isIntermediateSuggestion);
        return true;
    },

    /**
     * @return {boolean}
     */
    acceptSuggestion: function()
    {
        var result = this._applySuggestion();
        this.hide();
        if (!result)
            return false;

        this._suggestBoxDelegate.acceptSuggestion();

        return true;
    },

    /**
     * @param {number} shift
     * @param {boolean=} isCircular
     * @return {boolean} is changed
     */
    _selectClosest: function(shift, isCircular)
    {
        if (!this._length)
            return false;

        this._userInteracted = true;

        if (this._selectedIndex === -1 && shift < 0)
            shift += 1;

        var index = this._selectedIndex + shift;

        if (isCircular)
            index = (this._length + index) % this._length;
        else
            index = Number.constrain(index, 0, this._length - 1);

        this._selectItem(index, true);
        this._applySuggestion(true);
        return true;
    },

    /**
     * @param {!Event} event
     */
    _onItemMouseDown: function(event)
    {
        this._selectedElement = event.currentTarget;
        this.acceptSuggestion();
        event.consume(true);
    },

    /**
     * @param {string} prefix
     * @param {string} text
     * @param {string=} className
     */
    _createItemElement: function(prefix, text, item, className)
    {
        var element = createElementWithClass("div", "suggest-box-content-item source-code " + (className || ""));
        element.tabIndex = -1;
        var texts = text.trimEnd(50 + prefix.length).toLowerCase().split(prefix.toLowerCase());
        var index = 0;
        for (var i = 0; i < texts.length; i++){
            if (texts[i].length)
                element.createChild("span", "suffix").textContent = text.substring(index,index+texts[i].length);
            index += texts[i].length;

            if (prefix.length && i < texts.length-1)
                element.createChild("span", "prefix").textContent = text.substring(index,index+prefix.length);
            index += prefix.length;

        }
        element.__fullValue = text;
        var valueElement = element.createChild("span", "value");
        this._buildValueElement(valueElement, item);
        element.createChild("span", "spacer");
        element.addEventListener("mousedown", this._onItemMouseDown.bind(this), false);
        return element;
    },

    _buildValueElement: function(element, item)
    {
        if (!item)
            return;
        switch (item.type) {
            case "number":
            case "boolean":
            case "undefined":
                element.textContent = item.value;
                break;
            case "string":
                element.textContent = "\""+ item.value + "\"";
                break;
            case "function":
                var match = item.value.match(/\(([^)]*)\)/);
                if (item.value.startsWith("function") && match && match.length > 1)
                    element.textContent = "fn(" + match[1].split(",").map(str => str.trim()).join(", ") + ")";
                else
                    element.textContent = "fn()";
                break;
            case "object":
                if (item.value === "null" || !item.constructor) {
                    element.textContent = item.value;
                    break;
                }
                element.textContent = item.constructor;

                break;
        }
    },
    /**
     * @param {!WebInspector.SuggestBox.Suggestions} items
     * @param {string} userEnteredText
     * @param {function(number): !Promise<{detail:string, description:string}>=} asyncDetails
     */
    _updateItems: function(items, userEnteredText, asyncDetails)
    {
        this._length = items.length;
        this._asyncDetailsPromises.clear();
        this._asyncDetailsCallback = asyncDetails;
        this._elementList = [];
        delete this._selectedElement;

        for (var i = 0; i < items.length; ++i) {
            var item = items[i];
            var currentItemElement = this._createItemElement(userEnteredText, item.title, item, item.className);
            this._elementList.push(new WebInspector.StaticViewportElement(currentItemElement));
        }
    },

    /**
     * @param {number} index
     * @return {!Promise<?{detail: string, description: string}>}
     */
    _asyncDetails: function(index)
    {
        if (!this._asyncDetailsCallback)
            return Promise.resolve(/** @type {?{description: string, detail: string}} */(null));
        if (!this._asyncDetailsPromises.has(index))
            this._asyncDetailsPromises.set(index, this._asyncDetailsCallback(index));
        return /** @type {!Promise<?{detail: string, description: string}>} */(this._asyncDetailsPromises.get(index));
    },

    /**
     * @param {?{detail: string, description: string}} details
     */
    _showDetailsPopup: function(details)
    {
        this._detailsPopup.removeChildren();
        if (!details)
            return;
        this._detailsPopup.createChild("section", "detail").createTextChild(details.detail);
        this._detailsPopup.createChild("section", "description").createTextChild(details.description);
        this._detailsPopup.classList.remove("hidden");
    },

    /**
     * @param {number} index
     * @param {boolean} scrollIntoView
     */
    _selectItem: function(index, scrollIntoView)
    {
        if (this._selectedElement)
            this._selectedElement.classList.remove("selected");

        this._selectedIndex = index;
        if (index < 0)
            return;

        this._selectedElement = this._elementList[index].element();
        this._selectedElement.classList.add("selected");
        this._detailsPopup.classList.add("hidden");
        var elem = this._selectedElement;
        this._asyncDetails(index).then(showDetails.bind(this), function(){});

        if (scrollIntoView)
            this._viewport.scrollItemIntoView(index);

        /**
         * @param {?{detail: string, description: string}} details
         * @this {WebInspector.SuggestBox}
         */
        function showDetails(details)
        {
            if (elem === this._selectedElement)
                this._showDetailsPopup(details);
        }
    },

    /**
     * @param {!WebInspector.SuggestBox.Suggestions} completions
     * @param {boolean} canShowForSingleItem
     * @param {string} userEnteredText
     */
    _canShowBox: function(completions, canShowForSingleItem, userEnteredText)
    {
        if (!completions || !completions.length)
            return false;

        if (completions.length > 1 || !completions[0].title.startsWith(userEnteredText))
            return true;

        // Do not show a single suggestion if it is the same as user-entered prefix, even if allowed to show single-item suggest boxes.
        return canShowForSingleItem && completions[0].title !== userEnteredText;
    },

    _ensureRowCountPerViewport: function()
    {
        if (this._rowCountPerViewport)
            return;
        if (!this._elementList.length)
            return;

        this._rowCountPerViewport = Math.floor(this._element.offsetHeight / this._rowHeight);
    },

    /**
     * @param {!AnchorBox} anchorBox
     * @param {!WebInspector.SuggestBox.Suggestions} completions
     * @param {number} selectedIndex
     * @param {boolean} canShowForSingleItem
     * @param {string} userEnteredText
     * @param {function(number): !Promise<{detail:string, description:string}>=} asyncDetails
     */
    updateSuggestions: function(anchorBox, completions, selectedIndex, canShowForSingleItem, userEnteredText, asyncDetails)
    {
        delete this._onlyCompletion;
        if (this._canShowBox(completions, canShowForSingleItem, userEnteredText)) {
            this._updateItems(completions, userEnteredText, asyncDetails);
            this._show();
            this._updateBoxPosition(anchorBox);
            this._selectItem(selectedIndex, selectedIndex > 0);
            delete this._rowCountPerViewport;
            this._viewport.invalidate();
        } else {
            if (completions.length === 1)
                this._onlyCompletion = completions[0].title;
            this.hide();
        }
    },

    /**
     * @param {!KeyboardEvent} event
     * @return {boolean}
     */
    keyPressed: function(event)
    {
        switch (event.key) {
        case "ArrowUp":
            return this.upKeyPressed();
        case "ArrowDown":
            return this.downKeyPressed();
        case "PageUp":
            return this.pageUpKeyPressed();
        case "PageDown":
            return this.pageDownKeyPressed();
        case "Enter":
            return this.enterKeyPressed();
        }
        return false;
    },

    /**
     * @return {boolean}
     */
    upKeyPressed: function()
    {
        return this._selectClosest(-1, true);
    },

    /**
     * @return {boolean}
     */
    downKeyPressed: function()
    {
        return this._selectClosest(1, true);
    },

    /**
     * @return {boolean}
     */
    pageUpKeyPressed: function()
    {
        this._ensureRowCountPerViewport();
        return this._selectClosest(-this._rowCountPerViewport, false);
    },

    /**
     * @return {boolean}
     */
    pageDownKeyPressed: function()
    {
        this._ensureRowCountPerViewport();
        return this._selectClosest(this._rowCountPerViewport, false);
    },

    /**
     * @return {boolean}
     */
    enterKeyPressed: function()
    {
        if (!this._userInteracted && this._captureEnter)
            return false;

        var hasSelectedItem = !!this._selectedElement || this._onlyCompletion;
        this.acceptSuggestion();

        // Report the event as non-handled if there is no selected item,
        // to commit the input or handle it otherwise.
        return hasSelectedItem;
    },

    /**
     * @override
     * @param {number} index
     * @return {number}
     */
    fastHeight: function(index)
    {
        return this._rowHeight;
    },

    /**
     * @return {number}
     */
    itemCount: function()
    {
        return this._elementList.length;
    },

    /**
     * @return {number}
     */
    minimumRowHeight: function()
    {
        return this._rowHeight;
    },

    /**
     * @param {number} index
     * @return {?WebInspector.ViewportElement}
     */
    itemElement: function(index)
    {
        return this._elementList[index];
    }
}

/**
 * @constructor
 * // FIXME: make SuggestBox work for multiple documents.
 * @suppressGlobalPropertiesCheck
 */
WebInspector.SuggestBox.Overlay = function()
{
    this.element = createElementWithClass("div", "suggest-box-overlay");
    var root = WebInspector.createShadowRootWithCoreStyles(this.element, "ui/suggestBox.css");
    this._leftSpacerElement = root.createChild("div", "suggest-box-left-spacer");
    this._horizontalElement = root.createChild("div", "suggest-box-horizontal");
    this._topSpacerElement = this._horizontalElement.createChild("div", "suggest-box-top-spacer");
    this._bottomSpacerElement = this._horizontalElement.createChild("div", "suggest-box-bottom-spacer");
    this._resize();
    document.body.appendChild(this.element);
}

WebInspector.SuggestBox.Overlay.prototype = {
    /**
     * @param {number} offset
     */
    setLeftOffset: function(offset)
    {
        this._leftSpacerElement.style.flexBasis = offset + "px";
    },

    /**
     * @param {number} offset
     * @param {boolean} isTopOffset
     */
    setVerticalOffset: function(offset, isTopOffset)
    {
        this.element.classList.toggle("under-anchor", isTopOffset);

        if (isTopOffset) {
            this._bottomSpacerElement.style.flexBasis = "auto";
            this._topSpacerElement.style.flexBasis = offset + "px";
        } else {
            this._bottomSpacerElement.style.flexBasis = offset + "px";
            this._topSpacerElement.style.flexBasis = "auto";
        }
    },

    /**
     * @param {!Element} element
     */
    setContentElement: function(element)
    {
        this._horizontalElement.insertBefore(element, this._bottomSpacerElement);
    },

    _resize: function()
    {
        var container = WebInspector.Dialog.modalHostView().element;
        var containerBox = container.boxInWindow(container.ownerDocument.defaultView);

        this.element.style.left = containerBox.x + "px";
        this.element.style.top = containerBox.y + "px";
        this.element.style.height = containerBox.height + "px";
        this.element.style.width = containerBox.width + "px";
    },

    dispose: function()
    {
        this.element.remove();
    }
}
