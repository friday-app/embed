import SERVICES from "./services";
import "./index.css";
import { debounce } from "debounce";

/**
 * @typedef {object} EmbedData
 * @description Embed Tool data
 * @property {string} service - service name
 * @property {string} url - source URL of embedded content
 * @property {string} embed - URL to source embed page
 * @property {number} [width] - embedded content width
 * @property {number} [height] - embedded content height
 */
/**
 * @typedef {object} Service
 * @description Service configuration object
 * @property {RegExp} regex - pattern of source URLs
 * @property {string} embedUrl - URL scheme to embedded page. Use '<%= remote_id %>' to define a place to insert resource id
 * @property {string} html - iframe which contains embedded content
 * @property {Function} [id] - function to get resource id from RegExp groups
 */
/**
 * @typedef {object} EmbedConfig
 * @description Embed tool configuration object
 * @property {object} [services] - additional services provided by user. Each property should contain Service object
 */

/**
 * @class Embed
 * @classdesc Embed Tool for Editor.js 2.0
 *
 * @property {object} api - Editor.js API
 * @property {EmbedData} _data - private property with Embed data
 * @property {HTMLElement} element - embedded content container
 *
 * @property {object} services - static property with available services
 * @property {object} patterns - static property with patterns for paste handling configuration
 */
export default class Embed {
  /**
   * @param {{data: EmbedData, config: EmbedConfig, api: object}}
   *   data — previously saved data
   *   config - user config for Tool
   *   api - Editor.js API
   *   readOnly - read-only mode flag
   */
  constructor({ data, api, readOnly }) {
    this.api = api;
    this._data = {};
    this.element = null;
    this.readOnly = readOnly;

    this.data = data;
  }

  /**
   * @param {EmbedData} data
   * @param {RegExp} [data.regex] - pattern of source URLs
   * @param {string} [data.embedUrl] - URL scheme to embedded page. Use '<%= remote_id %>' to define a place to insert resource id
   * @param {string} [data.html] - iframe which contains embedded content
   * @param {number} [data.height] - iframe height
   * @param {number} [data.width] - iframe width
   */
  set data(data) {
    if (!(data instanceof Object)) {
      throw Error("Embed Tool data should be object");
    }

    const { service, source, embed, width, height } = data;

    this._data = {
      service: service || this.data.service,
      source: source || this.data.source,
      embed: embed || this.data.embed,
      width: width || this.data.width,
      height: height || this.data.height
    };

    const oldView = this.element;

    if (oldView) {
      oldView.parentNode.replaceChild(this.render(), oldView);
    }
  }

  /**
   * @returns {EmbedData}
   */
  get data() {
    return this._data;
  }

  /**
   * Get plugin styles
   *
   * @returns {object}
   */
  get CSS() {
    return {
      baseClass: this.api.styles.block,
      input: this.api.styles.input,
      container: "embed-tool",
      containerLoading: "embed-tool--loading",
      preloader: "embed-tool__preloader",
      url: "embed-tool__url",
      content: "embed-tool__content"
    };
  }

  /**
   * Render Embed tool content
   *
   * @returns {HTMLElement}
   */
  render() {
    if (!this.data.service) {
      const container = document.createElement("div");

      this.element = container;

      return container;
    }

    const { html } = Embed.services[this.data.service];
    const container = document.createElement("div");
    const template = document.createElement("template");
    const preloader = this.createPreloader();

    container.classList.add(
      this.CSS.baseClass,
      this.CSS.container,
      this.CSS.containerLoading
    );

    container.appendChild(preloader);

    template.innerHTML = html;
    template.content.firstChild.setAttribute("src", this.data.embed);
    template.content.firstChild.classList.add(this.CSS.content);

    const embedIsReady = this.embedIsReady(container);

    container.appendChild(template.content.firstChild);

    embedIsReady.then(() => {
      container.classList.remove(this.CSS.containerLoading);
    });

    this.element = container;

    return container;
  }

  /**
   * Creates preloader to append to container while data is loading
   *
   * @returns {HTMLElement}
   */
  createPreloader() {
    const preloader = document.createElement("preloader");
    const url = document.createElement("div");

    url.textContent = this.data.source;

    preloader.classList.add(this.CSS.preloader);
    url.classList.add(this.CSS.url);

    preloader.appendChild(url);

    return preloader;
  }

  /**
   * Save current content and return EmbedData object
   *
   * @returns {EmbedData}
   */
  save() {
    return this.data;
  }

  /**
   * Handle pasted url and return Service object
   *
   * @param {PasteEvent} event- event with pasted data
   * @returns {Service}
   */
  onPaste(event) {
    const { key: service, data: url } = event.detail;

    const {
      regex,
      embedUrl,
      width,
      height,
      id = ids => ids.shift()
    } = Embed.services[service];
    const result = regex.exec(url).slice(1);
    const embed = embedUrl.replace(/<\%\= remote\_id \%\>/g, id(result));

    this.data = {
      service,
      source: url,
      embed,
      width,
      height
    };
  }

  /**
   * Analyze provided config and make object with services to use
   *
   * @param {EmbedConfig} config
   */
  static prepare({ config = {} }) {
    const { services = {} } = config;

    let entries = Object.entries(SERVICES);

    const enabledServices = Object.entries(services)
      .filter(([key, value]) => {
        return typeof value === "boolean" && value === true;
      })
      .map(([key]) => key);

    const userServices = Object.entries(services)
      .filter(([key, value]) => {
        return typeof value === "object";
      })
      .filter(([key, service]) => Embed.checkServiceConfig(service))
      .map(([key, service]) => {
        const { regex, embedUrl, html, height, width, id } = service;

        return [
          key,
          {
            regex,
            embedUrl,
            html,
            height,
            width,
            id
          }
        ];
      });

    if (enabledServices.length) {
      entries = entries.filter(([key]) => enabledServices.includes(key));
    }

    entries = entries.concat(userServices);

    Embed.services = entries.reduce((result, [key, service]) => {
      if (!(key in result)) {
        result[key] = service;

        return result;
      }

      result[key] = Object.assign({}, result[key], service);

      return result;
    }, {});

    Embed.patterns = entries.reduce((result, [key, item]) => {
      result[key] = item.regex;

      return result;
    }, {});
  }

  /**
   * Check if Service config is valid
   *
   * @param {Service} config
   * @returns {boolean}
   */
  static checkServiceConfig(config) {
    const { regex, embedUrl, html, height, width, id } = config;

    let isValid =
      regex &&
      regex instanceof RegExp &&
      embedUrl &&
      typeof embedUrl === "string" &&
      html &&
      typeof html === "string";

    isValid = isValid && (id !== undefined ? id instanceof Function : true);
    isValid =
      isValid && (height !== undefined ? Number.isFinite(height) : true);
    isValid = isValid && (width !== undefined ? Number.isFinite(width) : true);

    return isValid;
  }

  /**
   * Paste configuration to enable pasted URLs processing by Editor
   */
  static get pasteConfig() {
    return {
      patterns: Embed.patterns
    };
  }

  /**
   * Notify core that read-only mode is supported
   *
   * @returns {boolean}
   */
  static get isReadOnlySupported() {
    return true;
  }

  /**
   * Checks that mutations in DOM have finished after appending iframe content
   *
   * @param {HTMLElement} targetNode - HTML-element mutations of which to listen
   * @returns {Promise<any>} - result that all mutations have finished
   */
  embedIsReady(targetNode) {
    const PRELOADER_DELAY = 450;

    let observer = null;

    return new Promise((resolve, reject) => {
      observer = new MutationObserver(debounce(resolve, PRELOADER_DELAY));
      observer.observe(targetNode, {
        childList: true,
        subtree: true
      });
    }).then(() => {
      observer.disconnect();
    });
  }
}
