import tkinter as tk
from tkinter import ttk, messagebox

# Vadose Parameters
DEFAULT_VADOSE_PARAMS_LENS = {
    "Thickness of Lens (m)" : 0.0,
    "Total Porosity of Lens (cm³/cm³) Range: 0 to 0.6" : 0.25,
    "Residual Water Content of Lens (cm³/cm³) Range 0 to 1" : 0.21,
    "Sat. Conductivity of the Lens (m/day) Range: 0.0001 to 100" : 0.022,
    "Value of Van Genuchtens, Range: 1.09 (Clay) to 3 (Cobbles)" : 1.09
}

DEFAULT_VADOSE_PARAMS_SOURCE = {
    "Depth to Top of Contamination (m)" : 0,
    "Thickness of Contamination (m)" : 1,
    "Length of Source Area (m)" : 10,
    "Width of Source Area (m)" : 10
}

DEFAULT_VADOSE_PARAMS_UNSATURATED = {
    "Infiltration Rate (cm/yr)" : 20.0,
    "Thickness of Vadose Zone (m)" : 10,
    "Total Porosity (cm³/cm³) Range: 0 to 0.6" : 0.25,
    "Residual Water Content (cm³/cm³) Range: 0 to Porosity" : 0.05,
    "Sat. Conductivity of Vadose Zone (m/day) Range: 0.001 t 100" : 7.13,
     "Value of Van Genuchtens, Range: 1.09 (Clay) to 3 (Cobbles)" : 1.09, 
    "Fraction Organic Carbon (g oc/g soil) Range 0.001 to 0.05": 0.009,
    "Hydraulic Conductivity": 0.1,
    "Soil Bulk Density" : 1.64
}

DEFAULT_VADOSE_PARAMS_SATURATED = {
    "Hydraulic Gradient (m/m)" : 0.1,
    "Effective Porosity (cm³/cm³)": 0.25,
    "Fraction Organic Carbon (g oc/g soil) Range 0.001 to 0.05": 0.009,
    "Hydraulic Conductivity (m/day)": 0.1,
    "Soil Bulk Density (g/cm³)" : 1.64,
    "Longitudinal Dispersion (0 for code calculated)(m)": 0.0,
    "Transverse Dispersion (0 for code calculated)(m)": 0.0,
    "Vertical Dispersion (0 for code calculated)(m)": 0.0
}

DEFAULT_VADOSE_PARAMS_WELL = {
    "Receptor Distance Downgradient (m)" : 30,
    "Receptor Distance Crossgradient (m)" : 0,
    "Depth to Top of Well Screen (m)" : 0,
    "Depth to Bottom of Well Screen (m)" : 1,
    "No. of Points Used to Calculated Con. (Min : 2)" : 2
}

DEFAULT_SATURATED_PARAMS = {
    "Hydraulic Gradient" : 0.1,
    "Effective Porosity": 0.25,
    "Fraction Organic Carbon": 0.009,
    "Hydraulic Conductivity": 0.1,
    "Soil Bulk Density" : 1.64,
    "Longitudinal Dispersion": 0.0,
    "Transverse Dispersion": 0.0,
    "Vertical Dispersion": 0.0,
}

DEFAULT_DISSOLVED_PARAMS = {
    "Hydraulic Gradient (m/m)" : 0.1,
    "Effective Porosity (cm³/cm³)": 0.25,
    "Fraction Organic Carbon (g oc/g soil) Range 0.001 to 0.05": 0.009,
    "Hydraulic Conductivity (m/day)": 0.1,
    "Soil Bulk Density (g/cm³)" : 1.64,
    "Longitudinal Dispersion (0 for code calculated)(m)": 0.0,
    "Transverse Dispersion (0 for code calculated)(m)": 0.0,
    "Vertical Dispersion (0 for code calculated)(m)": 0.0,
    "Thickness of Source Area (m)" : 1,
    "Length of Source Area (m)" : 10,
    "Width of Source Area (m)" : 10,
    "Receptor Distance Downgradient (m)" : 30,
    "Receptor Distance Crossgradient (m)" : 0,
    "Depth to Top of Well Screen (m)" : 0,
    "Depth to Bottom of Well Screen (m)" : 1,
    "No. of Points Used to Calculated Con. (Min : 2)" : 2
}

CHEMICAL_DEGRADATION = {
    "Benzene": 0.00096,
    "Toluene": 0.025,
    "Ethylbenzene": 0.003,
    "Xylenes": 0.00019,
}

class modelApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Model GUI")
        self.geometry("550x600")

        # Notebook for tabs
        self.notebook = ttk.Notebook(self)
        self.notebook.pack(fill="both", expand=True)

        # Tabs
        self.general_tab = ttk.Frame(self.notebook)
        self.notebook.add(self.general_tab, text="General Settings")

        self.contaminants_tab = ttk.Frame(self.notebook)
        self.notebook.add(self.contaminants_tab, text="Contaminants")
        self.notebook.tab(self.contaminants_tab, state="disabled")  # Initially locked

        self.vadose_tab = ttk.Frame(self.notebook)
        self.notebook.add(self.vadose_tab, text="Vadose Zone")
        self.notebook.tab(self.vadose_tab, state="disabled")  # Initially locked

        self.dissolved_tab = ttk.Frame(self.notebook)
        self.notebook.add(self.dissolved_tab, text="Dissolved Source")
        self.notebook.tab(self.dissolved_tab, state="disabled")  # Initially locked

        self.saturated_tab = ttk.Frame(self.notebook)
        self.notebook.add(self.saturated_tab, text="Saturated Zone")
        self.notebook.tab(self.saturated_tab, state="disabled")  # Initially locked

        self.output_tab = ttk.Frame(self.notebook)
        self.notebook.add(self.output_tab, text="Results")

        # Build each tab
        self.build_general_tab()
        self.build_contaminants_tab()
        self.build_dissolved_tab()
        self.build_vadose_tab()
        self.build_saturated_tab()
        self.build_output_tab()

        # Contaminant list
        self.contaminants = []

    def build_general_tab(self):
        ttk.Label(self.general_tab, text="Choose Model:").grid(row=1, column=0, padx=10, pady=10)
        self.model_var = tk.StringVar()
        model_dropdown = ttk.Combobox(self.general_tab, textvariable=self.model_var, width=50)
        model_dropdown["values"] = [
            "Vadose Soil to Groundwater",
            "Saturated Soil to Groundwater",
            "Dissolved Source"
        ]
        model_dropdown.grid(row=1, column=1, padx=10, pady=10)
        model_dropdown.bind("<<ComboboxSelected>>", self.on_model_selected)

    def build_contaminants_tab(self):
        # Input fields for contaminant and concentration
        ttk.Label(self.contaminants_tab, text="Select Contaminant:").grid(row=0, column=0, padx=10, pady=10, sticky="w")
        self.contaminant_var = tk.StringVar()
        contaminant_dropdown = ttk.Combobox(self.contaminants_tab, textvariable=self.contaminant_var, state="readonly")
        contaminant_dropdown["values"] = list(CHEMICAL_DEGRADATION.keys())
        contaminant_dropdown.grid(row=0, column=1, padx=10, pady=10)
        contaminant_dropdown.current(0)

        ttk.Label(self.contaminants_tab, text="Input Concentration (mg/L):").grid(row=1, column=0, padx=10, pady=10, sticky="w")
        self.concentration_var = tk.DoubleVar()
        concentration_entry = ttk.Entry(self.contaminants_tab, textvariable=self.concentration_var)
        concentration_entry.grid(row=1, column=1, padx=10, pady=10)

        # Add button
        add_button = ttk.Button(self.contaminants_tab, text="Add Contaminant", command=self.add_contaminant)
        add_button.grid(row=2, column=1, padx=10, pady=10)

        # Contaminant table
        self.contaminant_table = ttk.Treeview(self.contaminants_tab, columns=("Contaminant", "Concentration"), show="headings")
        self.contaminant_table.heading("Contaminant", text="Contaminant")
        self.contaminant_table.heading("Concentration", text="Concentration (mg/L)")
        self.contaminant_table.grid(row=3, column=0, columnspan=2, padx=10, pady=10, sticky="nsew")

        # Remove button
        remove_button = ttk.Button(self.contaminants_tab, text="Remove Selected", command=self.remove_selected_contaminant)
        remove_button.grid(row=4, column=1, padx=10, pady=10, sticky="e")

    def build_output_tab(self):
        ttk.Label(self.output_tab, text="Output results will go here.").pack(padx=10, pady=10)

    def add_contaminant(self):
        contaminant = self.contaminant_var.get()
        concentration = self.concentration_var.get()

        if not contaminant:
            messagebox.showwarning("Warning", "Please select a contaminant.")
            return
        if concentration <= 0:
            messagebox.showwarning("Warning", "Please enter a valid concentration.")
            return

        # Check if contaminant is already in the list
        for item in self.contaminants:
            if item["Contaminant"] == contaminant:
                messagebox.showwarning("Warning", f"{contaminant} is already in the list.")
                return

        # Add contaminant to the list
        self.contaminants.append({"Contaminant": contaminant, "Concentration": concentration})

        # Update table
        self.update_contaminant_table()

    def update_contaminant_table(self):
        # Clear table
        for item in self.contaminant_table.get_children():
            self.contaminant_table.delete(item)

        # Populate table with contaminants
        for contaminant in self.contaminants:
            self.contaminant_table.insert("", "end", values=(contaminant["Contaminant"], contaminant["Concentration"]))

    def remove_selected_contaminant(self):
        selected_item = self.contaminant_table.selection()
        if not selected_item:
            messagebox.showwarning("Warning", "Please select a contaminant to remove.")
            return

        # Remove contaminant from the list
        for item in selected_item:
            contaminant = self.contaminant_table.item(item, "values")[0]
            self.contaminants = [c for c in self.contaminants if c["Contaminant"] != contaminant]

        # Update table
        self.update_contaminant_table()

    def build_vadose_tab(self):
        # Setup scrollable canvas
        outer_frame = ttk.Frame(self.vadose_tab, width=600)
        outer_frame.grid(row=0, column=0, sticky="nsew")

        canvas = tk.Canvas(outer_frame, width=480, height=500, highlightthickness=1, highlightbackground="black")
        canvas.grid(row=0, column=0, sticky="nsew")

        # Vertical and horizontal scrollbars
        y_scroll = ttk.Scrollbar(outer_frame, orient="vertical", command=canvas.yview)
        y_scroll.grid(row=0, column=1, sticky="ns")

        canvas.configure(yscrollcommand=y_scroll.set)

        # Scrollable frame inside canvas
        scrollable_frame = ttk.Frame(canvas)
        canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")

        # Update scrollregion dynamically
        scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all")),
        )

        # Enable mouse scrolling
        canvas.bind_all("<MouseWheel>", lambda e: canvas.yview_scroll(-1 * (e.delta // 120), "units"))
        canvas.bind_all("<Button-4>", lambda e: canvas.yview_scroll(-1, "units"))  # macOS/Linux
        canvas.bind_all("<Button-5>", lambda e: canvas.yview_scroll(1, "units"))   # macOS/Linux

        # Style the scrollbars
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("Vertical.TScrollbar", troughcolor="lightgray", background="gray", arrowcolor="black")
        style.configure("Horizontal.TScrollbar", troughcolor="lightgray", background="gray", arrowcolor="black")

        # Add the frame to the canvas
        canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")

        # Populate the scrollable frame
        self.vadose_params = {}
        row = 0

        def add_section(title, params_dict):
            nonlocal row
            section_frame = ttk.LabelFrame(scrollable_frame, text=title, padding=(10, 5))
            section_frame.grid(row=row, column=0, padx=10, pady=10, sticky="nw")

            for idx, (param, default) in enumerate(params_dict.items()):
                ttk.Label(section_frame, text=f"{param}:").grid(row=idx, column=0, padx=5, pady=5, sticky="w")
                var = tk.DoubleVar(value=default)
                entry = ttk.Entry(section_frame, textvariable=var, width=15)
                entry.grid(row=idx, column=1, padx=5, pady=5)
                self.vadose_params[param] = var

            row += 1  # Move to the next column

        # Add sections
        add_section("Lens Characteristics", DEFAULT_VADOSE_PARAMS_LENS)
        add_section("Unsaturated Source Data", DEFAULT_VADOSE_PARAMS_SOURCE)
        add_section("Unsaturated Zone Params", DEFAULT_VADOSE_PARAMS_UNSATURATED)
        add_section("Saturated Zone Params", DEFAULT_VADOSE_PARAMS_SATURATED)
        add_section("Receptor Well Params", DEFAULT_VADOSE_PARAMS_WELL)

        outer_frame.rowconfigure(0, weight=1)

    def build_saturated_tab(self):
        self.saturated_params = {}
        row = 0
        for param, default in DEFAULT_SATURATED_PARAMS.items():
            ttk.Label(self.saturated_tab, text=f"{param}:").grid(row=row, column=0, padx=10, pady=5, sticky="w")
            var = tk.DoubleVar(value=default)
            entry = ttk.Entry(self.saturated_tab, textvariable=var, width=10)
            entry.grid(row=row, column=1, padx=10, pady=5)
            self.saturated_params[param] = var
            row += 1

    def build_dissolved_tab(self):
        self.params = {}
        row = 0
        for param, default in DEFAULT_DISSOLVED_PARAMS.items():
            ttk.Label(self.dissolved_tab, text=f"{param}:").grid(row=row, column=0, padx=10, pady=5, sticky="w")
            var = tk.DoubleVar(value=default)
            entry = ttk.Entry(self.dissolved_tab, textvariable=var, width=10)
            entry.grid(row=row, column=1, padx=10, pady=5)
            self.params[param] = var
            row += 1

    def build_output_tab(self):
        self.output_text = tk.Text(self.output_tab, height=20, width=70)
        self.output_text.pack(padx=10, pady=10)

        calculate_button = ttk.Button(self.output_tab, text="Calculate", command=self.calculate)
        calculate_button.pack(side="left", padx=10, pady=10)

        export_button = ttk.Button(self.output_tab, text="Export to CSV", command=self.export_results)
        export_button.pack(side="left", padx=10, pady=10)

    def on_model_selected(self, event):
        model = self.model_var.get()
        if model == "Dissolved Source":
            self.notebook.tab(self.dissolved_tab, state="normal")
            self.notebook.tab(self.vadose_tab, state="disabled")
            self.notebook.tab(self.saturated_tab, state="disabled")

            self.notebook.tab(self.contaminants_tab, state="normal")
        elif model == "Vadose Soil to Groundwater":
            self.notebook.tab(self.dissolved_tab, state="disabled")
            self.notebook.tab(self.vadose_tab, state="normal")
            self.notebook.tab(self.saturated_tab, state="disabled")

            self.notebook.tab(self.contaminants_tab, state="normal")

        elif model == "Saturated Soil to Groundwater":
            self.notebook.tab(self.dissolved_tab, state="disabled")
            self.notebook.tab(self.vadose_tab, state="disabled")
            self.notebook.tab(self.saturated_tab, state="normal")

            self.notebook.tab(self.contaminants_tab, state="normal")

    def calculate(self):
        chemical = self.contaminant_var.get()
        degradation_rate = CHEMICAL_DEGRADATION[chemical]
        results = f"Selected Chemical: {chemical}\nDegradation Rate: {degradation_rate} per day\n\nParameters:\n"
        for param, var in self.params.items():
            results += f"{param}: {var.get()}\n"
        self.output_text.delete(1.0, tk.END)
        self.output_text.insert(tk.END, results)

    def export_results(self):
        try:
            with open("risc_results.csv", "w") as f:
                f.write(self.output_text.get(1.0, tk.END))
            messagebox.showinfo("Success", "Results exported to 'risc_results.csv'")
        except Exception as e:
            messagebox.showerror("Error", f"Failed to export results: {e}")



if __name__ == "__main__":
    app = modelApp()
    # Disable vert, hor resizing
    app.resizable(False, False)
    app.mainloop()


