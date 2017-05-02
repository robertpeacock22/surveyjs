import {JsonObject} from "./jsonobject";
import {Base, IPage, IConditionRunner, ISurvey, ISurveyData, IElement, IQuestion, HashTable, SurveyElement, SurveyPageId} from "./base";
import {QuestionBase} from "./questionbase";
import {ConditionRunner} from "./conditions";
import {QuestionFactory} from "./questionfactory";
import {ILocalizableOwner, LocalizableString} from "./localizablestring";

export class QuestionRowModel {
    private visibleValue: boolean;
    visibilityChangedCallback: () => void;
    constructor(public panel: PanelModelBase) {
        this.visibleValue = panel.data && panel.data.isDesignMode;
    }
    public elements: Array<IElement> = [];
    //TODO remove after updating react and vue
    public get questions(): Array<IElement> { return this.elements;}
    public get visible(): boolean { return this.visibleValue; }
    public set visible(val: boolean) {
        if (val == this.visible) return;
        this.visibleValue = val;
        this.onVisibleChanged();
    }
    public updateVisible() {
        this.visible = this.calcVisible();
        this.setWidth();
    }
    public addElement(q: IElement) {
        this.elements.push(q);
        this.updateVisible();
    }
    protected onVisibleChanged() {
        if (this.visibilityChangedCallback) this.visibilityChangedCallback();
    }
    private setWidth() {
        var visCount = this.getVisibleCount();
        if (visCount == 0) return;
        var counter = 0;
        for (var i = 0; i < this.elements.length; i++)
            if (this.elements[i].isVisible) {
                var q = this.elements[i];
                q.renderWidth = q.width ? q.width : Math.floor(100 / visCount) + '%';
                q.rightIndent = counter < visCount - 1 ? 1 : 0;
                counter++;
            }
    }
    private getVisibleCount(): number {
        var res = 0;
        for (var i = 0; i < this.elements.length; i++) {
            if (this.elements[i].isVisible) res++;
        }
        return res;
    }
    private calcVisible(): boolean { return this.getVisibleCount() > 0; }
}

export class PanelModelBase extends Base implements IConditionRunner, ILocalizableOwner {
    private static panelCounter = 100;
    private static getPanelId(): string {
        return "sp_" + PanelModelBase.panelCounter++;
    }

    private dataValue: ISurvey = null;
    private idValue: string;
    private rowValues: Array<QuestionRowModel> = null;
    private conditionRunner: ConditionRunner = null;
    private elementsValue: Array<IElement> = new Array<IElement>();
    private isQuestionsReady: boolean = false;
    private questionsValue: Array<QuestionBase> = new Array<QuestionBase>();
    public parent: PanelModelBase = null;
    public visibleIf: string = "";
    rowsChangedCallback: () => void;
    private locTitleValue: LocalizableString;
    private locBodyValue: LocalizableString;
    public visibleIndex: number = -1;
    private visibleValue: boolean = true;
    constructor(public name: string = "") {
        super();
        this.idValue = PanelModelBase.getPanelId();
        this.locTitleValue = new LocalizableString(this, true);
        this.locBodyValue = new LocalizableString(this, true);
        var self = this;
        this.locTitleValue.onRenderedHtmlCallback = function(text) { return self.getRendredTitle(text); };
        this.locBodyValue.onRenderedHtmlCallback = function(text) { return self.getRenderedBody(text); };
        this.elementsValue.push = function (value): number { return self.doOnPushElement(this, value); };
        this.elementsValue.splice = function (start?: number, deleteCount?: number, ...items: QuestionBase[]): QuestionBase[] {
            return self.doSpliceElements(this, start, deleteCount, ...items);
        };
    }
    public get data(): ISurvey { return this.dataValue; }
    public set data(value: ISurvey) {
        if(this.dataValue === value) return;
        this.dataValue = value;
        for(var i = 0; i < this.elements.length; i ++) {
            this.elements[i].setData(value);
        }
    }
    public get title(): string { return this.locTitle.text; }
    public set title(newValue: string) {
        this.locTitle.text = newValue;
    }
    public get locTitle(): LocalizableString { return this.locTitleValue; }
    public get body(): string { return this.locBody.text; }
    public set body(newValue: string) {
        this.locBody.text = newValue;
    }
    public get locBody(): LocalizableString { return this.locBodyValue; }
    public getLocale(): string { return this.data ? (<ILocalizableOwner><any>this.data).getLocale() : ""; }
    public getMarkdownHtml(text: string)  { return this.data ? (<ILocalizableOwner><any>this.data).getMarkdownHtml(text) : null; }

    public get id(): string { return this.idValue; }
    public get isPanel(): boolean { return false; }
    public get questions(): Array<QuestionBase> {
        if(!this.isQuestionsReady) {
            this.questionsValue = [];
            for(var i = 0; i < this.elements.length; i ++) {
                var el = this.elements[i];
                if(el.isPanel) {
                    var qs = (<PanelModel>el).questions;
                    for(var j = 0; j < qs.length; j ++) {
                        this.questionsValue.push(qs[j]);
                    }
                } else {
                    this.questionsValue.push(<QuestionBase>el);
                }
            }
            this.isQuestionsReady = true;
        }

        return this.questionsValue;
    }
    private markQuestionListDirty() {
        this.isQuestionsReady = false;
        if(this.parent) this.parent.markQuestionListDirty();
    }
    public get elements(): Array<IElement> { return this.elementsValue; }
    public containsElement(element: IElement): boolean {
        for(var i = 0; i < this.elements.length; i ++) {
            var el: any = this.elements[i];
            if(el == element) return true;
            if(el.isPanel) {
                if((<PanelModelBase>el).containsElement(element)) return true;
            }
        }
        return false;
    }
    public hasErrors(fireCallback: boolean = true, focuseOnFirstError: boolean = false): boolean {
        var result = false;
        var firstErrorQuestion = null;
        var visibleQuestions = [];
        this.addQuestionsToList(visibleQuestions, true);
        for (var i = 0; i < visibleQuestions.length; i++) {
            var question = visibleQuestions[i];
            if(question.isReadOnly) continue;
            if (question.hasErrors(fireCallback)) {
                if (focuseOnFirstError && firstErrorQuestion == null) {
                    firstErrorQuestion = question;
                }
                result = true;
            }
        }
        if (firstErrorQuestion) firstErrorQuestion.focus(true);
        return result;
    }
    public addQuestionsToList(list: Array<IQuestion>, visibleOnly: boolean = false) {
        if (visibleOnly && !this.visible) return;
        for (var i = 0; i < this.elements.length; i++) {
            var el = this.elements[i];
            if (visibleOnly && !el.visible) continue;
            if(el.isPanel) {
                (<PanelModel>el).addQuestionsToList(list, visibleOnly);
            }
            else {
                list.push(<IQuestion>el);
            }
        }
    }
    public get rows(): Array<QuestionRowModel> {
        if(!this.rowValues) {
            this.rowValues = this.buildRows();
        }
        return this.rowValues;
    }
    public get isActive() { return (!this.data) || this.data.currentPage == this.root; }
    protected get root(): PanelModelBase {
        var res = <PanelModelBase>this;
        while(res.parent) res = res.parent;
        return res;
    }
    protected createRow(): QuestionRowModel { return new QuestionRowModel(this); }
    public onSurveyLoad() {
        for(var i = 0; i < this.elements.length; i ++) {
            this.elements[i].onSurveyLoad();
        }
        if(this.rowsChangedCallback) this.rowsChangedCallback();
    }
    protected get isLoadingFromJson(): boolean { return this.data && this.data.isLoadingFromJson; }
    protected onRowsChanged() {
        this.rowValues = null;
        if(this.rowsChangedCallback && !this.isLoadingFromJson) this.rowsChangedCallback();
    }
    private get isDesignMode() { return this.data && this.data.isDesignMode; }
    private doOnPushElement(list: Array<IElement>, value: IElement) {
        var result = Array.prototype.push.call(list, value);
        this.markQuestionListDirty();
        this.onAddElement(value, list.length);
        this.onRowsChanged();
        return result;
    }
    private doSpliceElements(list: Array<IElement>, start?: number, deleteCount?: number, ...items: IElement[]) {
        if(!start) start = 0;
        if(!deleteCount) deleteCount = 0;
        var deletedQuestions = [];
        for(var i = 0; i < deleteCount; i ++) {
            if(i + start >= list.length) continue;
            deletedQuestions.push(list[i + start]);
        }
        var result = Array.prototype.splice.call(list, start, deleteCount, ... items);
        this.markQuestionListDirty();
        if(!items) items = [];
        for(var i = 0; i < deletedQuestions.length; i ++) {
            this.onRemoveElement(deletedQuestions[i])
        }
        for(var i = 0; i < items.length; i ++) {
            this.onAddElement(items[i], start + i);
        }
        this.onRowsChanged();
        return result;
    }
    private onAddElement(element: IElement, index: number) {
        if(element.isPanel) {
            var p = <PanelModel>element;
            p.data = this.data;
            p.parent = this;
            if(this.data) {
                this.data.panelAdded(p, index, this, this.root);
            }
        } else {
            if(this.data) {
                var q = <QuestionBase>element;
                q.setData(this.data);
                this.data.questionAdded(q, index, this, this.root);
            }
        }
        var self = this;
        element.rowVisibilityChangedCallback = function () { self.onElementVisibilityChanged(element); }
        element.startWithNewLineChangedCallback = function () { self.onElementStartWithNewLineChanged(element); }
    }
    private onRemoveElement(element: IElement) {
        if(!element.isPanel) {
            if(this.data) this.data.questionRemoved(<QuestionBase>element);
        } else {
            if(this.data) this.data.panelRemoved(element);
        }
    }
    private onElementVisibilityChanged(element: any) {
        if (this.rowValues) {
            this.updateRowsVisibility(element);
        }
        if(this.parent) {
            this.parent.onElementVisibilityChanged(this);
        }
    }
    private onElementStartWithNewLineChanged(element: any) {
        this.onRowsChanged();
    }
    private updateRowsVisibility(element: any)  {
        for (var i = 0; i < this.rowValues.length; i++) {
            var row = this.rowValues[i];
            if (row.elements.indexOf(element) > -1) {
                row.updateVisible();
                break;
            }
        }
    }
    private buildRows(): Array<QuestionRowModel> {
        var result = new Array<QuestionRowModel>();
        var lastRowVisibleIndex = -1;
        var self = this;
        for (var i = 0; i < this.elements.length; i++) {
            var el = this.elements[i];
            var isNewRow = i == 0 || el.startWithNewLine;
            var row = isNewRow ? this.createRow() : result[result.length - 1];
            if(isNewRow) result.push(row);
            row.addElement(el);
        }
        for (var i = 0; i < result.length; i++) {
            result[i].updateVisible();
        }
        return result;
    }
    public get processedTitle() {
        return this.getRendredTitle(this.locTitle.textOrHtml);
    }
    public get processedBody() {
        return this.getRenderedBody(this.locTitle.textOrHtml);
    }
    protected getRendredTitle(str: string): string {
        if(!str && this.isPanel && this.isDesignMode) return "[" + this.name + "]";
        return this.data != null ? this.data.processText(str) : str;
    }
    protected getRenderedBody(str: string): string {
        if(!str && this.isPanel && this.isDesignMode) return "[" + this.name + "]";
        return this.data != null ? this.data.processText(str) : str;
    }
    public get visible(): boolean { return this.visibleValue; }
    public set visible(value: boolean) {
        if (value === this.visible) return;
        this.visibleValue = value;
        this.onVisibleChanged();
    }
    protected onVisibleChanged() {

    }
    public get isVisible(): boolean {  return (this.data && this.data.isDesignMode) || this.getIsPageVisible(null); }
    public getIsPageVisible(exceptionQuestion: IQuestion): boolean {
        if (!this.visible) return false;
        for (var i = 0; i < this.questions.length; i++) {
            if (this.questions[i] == exceptionQuestion) continue;
            if (this.questions[i].visible) return true;
        }
        return false;
    }
    public addElement(element: IElement, index: number = -1) {
        if (element == null) return;
        if (index < 0 || index >= this.elements.length) {
            this.elements.push(element);
        } else {
            this.elements.splice(index, 0, element);
        }
    }
    public addQuestion(question: QuestionBase, index: number = -1) {
        this.addElement(question, index);
    }
    public addPanel(panel: PanelModel, index: number = -1) {
        this.addElement(panel, index);
    }
    public addNewQuestion(questionType: string, name: string): QuestionBase {
        var question = QuestionFactory.Instance.createQuestion(questionType, name);
        this.addQuestion(question);
        return question;
    }
    public addNewPanel(name: string): PanelModel {
        var panel = this.createNewPanel(name);
        this.addPanel(panel);
        return panel;
    }
    protected createNewPanel(name: string): PanelModel {
        return new PanelModel(name);
    }
    public removeElement(element: IElement): boolean {
        var index = this.elements.indexOf(element);
        if (index < 0) {
            for(var i = 0; i < this.elements.length; i ++) {
                var el = this.elements[i];
                if(el.isPanel && (<PanelModelBase>(<any>el)).removeElement(element)) return true;
            }
            return false;
        }
        this.elements.splice(index, 1);
        return true;
    }
    public removeQuestion(question: QuestionBase) {
        this.removeElement(question);
    }
    public runCondition(values: HashTable<any>) {
        for(var i = 0; i < this.elements.length; i ++) {
            this.elements[i].runCondition(values);
        }
        if (!this.visibleIf) return;
        if (!this.conditionRunner) this.conditionRunner = new ConditionRunner(this.visibleIf);
        this.conditionRunner.expression = this.visibleIf;
        this.visible = this.conditionRunner.run(values);
    }
    public onLocaleChanged() {
        for(var i = 0; i < this.elements.length; i ++) {
            this.elements[i].onLocaleChanged()
        }
        this.locTitle.onChanged();
        this.locBody.onChanged();
    }
}

//export class
export class PanelModel extends PanelModelBase implements IElement {
    private renderWidthValue: string;
    private rightIndentValue: number;
    public width: string;
    private innerIndentValue: number = 0;
    private startWithNewLineValue: boolean = true;
    renderWidthChangedCallback: () => void;
    rowVisibilityChangedCallback: () => void;
    startWithNewLineChangedCallback: () => void;
    constructor(public name: string = "") {
        super(name);
    }
    public getType(): string { return "panel"; }
    public setData(newValue: ISurveyData) {
        this.data = <ISurvey>newValue;
    }
    public get isPanel(): boolean { return true; }
    public get innerIndent(): number { return this.innerIndentValue; }
    public set innerIndent(val: number) {
        if (val == this.innerIndentValue) return;
        this.innerIndentValue = val;
        if(this.renderWidthChangedCallback) this.renderWidthChangedCallback();
    }
    public get renderWidth(): string { return this.renderWidthValue; }
    public set renderWidth(val: string) {
        if (val == this.renderWidth) return;
        this.renderWidthValue = val;
        if(this.renderWidthChangedCallback) this.renderWidthChangedCallback();
    }
    public get startWithNewLine(): boolean { return this.startWithNewLineValue; }
    public set startWithNewLine(value: boolean) {
        if(this.startWithNewLine == value) return;
        this.startWithNewLineValue = value;
        if(this.startWithNewLineChangedCallback) this.startWithNewLineChangedCallback();
    }
    public get rightIndent(): number { return this.rightIndentValue; }
    public set rightIndent(val: number) {
        if (val == this.rightIndent) return;
        this.rightIndentValue = val;
        if(this.renderWidthChangedCallback) this.renderWidthChangedCallback();
    }
    protected onVisibleChanged() {
        if(this.rowVisibilityChangedCallback) this.rowVisibilityChangedCallback();
    }
}

JsonObject.metaData.addClass("panel", ["name",  { name: "elements", alternativeName: "questions", baseClassName: "question", visible: false },
    { name: "visible:boolean", default: true }, "visibleIf:expression", { name: "title:text", serializationProperty: "locTitle" },
    { name: "body:text", serializationProperty: "locBody" },
    {name: "innerIndent:number", default: 0, choices: [0, 1, 2, 3]}], function () { return new PanelModel(); });
