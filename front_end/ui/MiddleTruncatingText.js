// Copyright (c) 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {HTMLSpanElement}
 */
WebInspector.MiddleTruncatingText = function()
{
}

/** @const {number} */
WebInspector.MiddleTruncatingText.DefaultMinVisibleCharLength = 15;

/** @const {number} */
WebInspector.MiddleTruncatingText.DefaultMaxVisibleCharLength = 500;

/**
 * @return {!WebInspector.MiddleTruncatingText}
 */
WebInspector.MiddleTruncatingText.create = function()
{
    if (!WebInspector.MiddleTruncatingText._constructor)
        WebInspector.MiddleTruncatingText._constructor = registerCustomElement("span", "dt-inner-truncating-text", WebInspector.MiddleTruncatingText.prototype);
    return /** @type {!WebInspector.MiddleTruncatingText} */(new WebInspector.MiddleTruncatingText._constructor());
}

WebInspector.MiddleTruncatingText.prototype = {
    /**
     * @override
     * @this {Element}
     */
    createdCallback: function()
    {
        this._firstPart = this.createChild("span", "first-part");
        this._secondPart = this.createChild("span", "second-part");
        var root = WebInspector.createShadowRootWithCoreStyles(this, "ui/truncatingText.css");
        root.createChild("content");

        this._minVisibleCharLength = WebInspector.MiddleTruncatingText.DefaultMinVisibleCharLength;
        this._maxVisibleCharLength = WebInspector.MiddleTruncatingText.DefaultMaxVisibleCharLength;
    },

    /**
     * @param {string} text
     * @this {Element}
     */
    _updateTextContent: function(text)
    {
        if (!text)
            return;
        var firstPartLength = Math.min(text.length - this._minVisibleCharLength, this._maxVisibleCharLength);
        if (text.length > this._minVisibleCharLength)
            this._firstPart.textContent = text.substring(0, firstPartLength);
        if (text.length - this._minVisibleCharLength > this._maxVisibleCharLength)
            this._firstPart.textContent += "\u2026";
        this._secondPart.textContent = text.substring(text.length - this._minVisibleCharLength, text.length);
    },

    /**
     * @override
     * @param {string} text
     */
    set text(text)
    {
        this._updateTextContent(text)
    },

    /**
     * @override
     * @param {string} text
     */
    set textContent(text)
    {
        this._updateTextContent(text)
    },

    __proto__: HTMLSpanElement.prototype
}

/**
 * @constructor
 * @extends {HTMLAnchorElement}
 */
WebInspector.MiddleTruncatingLink = function()
{
}

/**
 * @return {!WebInspector.MiddleTruncatingLink}
 */
WebInspector.MiddleTruncatingLink.create = function()
{
    if (!WebInspector.MiddleTruncatingLink._constructor)
        WebInspector.MiddleTruncatingLink._constructor = registerCustomElement("a", "dt-inner-truncating-link", WebInspector.MiddleTruncatingLink.prototype);
    var anchorElement = /** @type {!WebInspector.MiddleTruncatingLink} */(new WebInspector.MiddleTruncatingLink._constructor());
    anchorElement.contentElement = WebInspector.MiddleTruncatingText.create();
    anchorElement.appendChild(anchorElement.contentElement);
    return anchorElement;
}

WebInspector.MiddleTruncatingLink.prototype = {
    /**
     * @override
     * @param {string} text
     */
    set text(text)
    {
        this.contentElement.text = text;
    },

    /**
     * @override
     * @param {string} text
     */
    set textContent(text)
    {
        this.contentElement.textContent = text;
    },

    __proto__: HTMLAnchorElement.prototype
}
